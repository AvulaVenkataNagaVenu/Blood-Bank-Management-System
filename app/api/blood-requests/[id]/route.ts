import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { BloodRequestModel, BloodStockModel, UserModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import { sendInAppNotification, notifyAdmins } from '@/lib/notifications'
import type { ApiResponse } from '@/lib/types'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Authentication required.' }, { status: 401 })
    }

    // Security: Donors are not permitted to inspect hospital blood requests
    if (auth.role === 'Donor') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Donors are not permitted to access blood requests.' },
        { status: 403 }
      )
    }

    const { id } = await params

    const bloodRequest = await BloodRequestModel.findById(id)
    if (!bloodRequest) {
      return NextResponse.json(
        { success: false, error: 'Blood request not found.' },
        { status: 404 }
      )
    }

    // Permission check: Hospital can only inspect its own request
    if (auth.role === 'Hospital' && bloodRequest.hospitalId.toString() !== auth.userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not have permission to view this request.' },
        { status: 403 }
      )
    }

    if (auth.role !== 'Admin' && auth.role !== 'Hospital') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions.' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: bloodRequest,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[requests] Get single blood request error occurred')
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve blood request.' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      )
    }

    const { id } = await params
    const body = await req.json()
    const { status, rejectionReason, cancellationReason, notes } = body

    if (!status || !['Approved', 'Rejected', 'Cancelled'].includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid target status. Status must be "Approved", "Rejected", or "Cancelled".',
        },
        { status: 400 }
      )
    }

    const bloodRequest = await BloodRequestModel.findById(id)
    if (!bloodRequest) {
      return NextResponse.json(
        { success: false, error: 'Blood request not found.' },
        { status: 404 }
      )
    }

    const user = await UserModel.findById(auth.userId)
    const actorName = user?.hospitalName || user?.name || (auth.role === 'Admin' ? 'Administrator' : 'Hospital User')

    // ----------------------------------------------------
    // Role-based Authorization Rules
    // ----------------------------------------------------
    if (auth.role === 'Donor') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Donors cannot modify blood requests.' },
        { status: 403 }
      )
    }

    // Hospital can ONLY cancel their OWN pending request
    if (auth.role === 'Hospital') {
      if (bloodRequest.hospitalId.toString() !== auth.userId) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: You can only manage your own hospital requests.' },
          { status: 403 }
        )
      }

      if (status !== 'Cancelled') {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Hospitals may only cancel pending requests.' },
          { status: 403 }
        )
      }

      if (bloodRequest.status !== 'Pending') {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot cancel request in status "${bloodRequest.status}". Only Pending requests can be cancelled by the hospital.`,
          },
          { status: 400 }
        )
      }
    }

    // ----------------------------------------------------
    // Status Transitions
    // ----------------------------------------------------

    // 1. APPROVAL (Admin only)
    if (status === 'Approved') {
      if (auth.role !== 'Admin') {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Only administrators can approve blood requests.' },
          { status: 403 }
        )
      }

      // Can only approve requests that are currently 'Pending'
      if (bloodRequest.status !== 'Pending') {
        return NextResponse.json(
          {
            success: false,
            error: `Request has already been processed (current status: ${bloodRequest.status}). Cannot approve a request that is not Pending.`,
          },
          { status: 400 }
        )
      }

      const historyEntry = {
        status: 'Approved' as const,
        changedBy: auth.userId,
        changedByName: actorName,
        changedByRole: 'Admin' as const,
        changedAt: new Date(),
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : 'Blood request approved for clinical issuance',
      }

      // CLINICAL SAFETY RULE:
      // Administrative approval authorizes the hospital request but does NOT dispense blood.
      // Stock deduction occurs upon verified clinical issuance via /api/blood-issuances.
      const updatedRequest = await BloodRequestModel.findOneAndUpdate(
        { _id: id, status: 'Pending' },
        {
          $set: {
            status: 'Approved',
            approvedBy: auth.userId,
            approvedDate: new Date(),
            rejectionReason: undefined,
          },
          $push: {
            statusHistory: historyEntry,
          },
        },
        { returnDocument: 'after' }
      )

      if (!updatedRequest) {
        return NextResponse.json(
          { success: false, error: 'Request was modified concurrently by another administrator.' },
          { status: 409 }
        )
      }

      // Non-blocking notification to the requesting Hospital
      await sendInAppNotification({
        recipientId: bloodRequest.hospitalId,
        recipientRole: 'Hospital',
        type: 'RequestApproved',
        title: 'Blood Request Approved',
        message: `Your request for ${bloodRequest.unitsRequired} unit(s) of ${bloodRequest.bloodGroup} has been approved.`,
        priority: bloodRequest.priority === 'Emergency' ? 'Emergency' : 'High',
        referenceId: updatedRequest._id,
        referenceType: 'BloodRequest',
        eventKey: `request:approved:${updatedRequest._id}`,
      })

      return NextResponse.json(
        {
          success: true,
          data: updatedRequest,
          message: 'Request approved successfully. It is now authorized for blood issuance.',
        },
        { status: 200 }
      )
    }

    // 2. REJECTION (Admin only)
    if (status === 'Rejected') {
      if (auth.role !== 'Admin') {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Only administrators can reject blood requests.' },
          { status: 403 }
        )
      }

      // Can reject from Pending or Approved (if unitsIssued === 0)
      if (bloodRequest.status !== 'Pending' && bloodRequest.status !== 'Approved') {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot reject request in status "${bloodRequest.status}". Only Pending or Approved unfulfilled requests can be rejected.`,
          },
          { status: 400 }
        )
      }

      if ((bloodRequest.unitsIssued || 0) > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot reject request because ${bloodRequest.unitsIssued} units have already been issued.`,
          },
          { status: 400 }
        )
      }

      const sanitizedReason =
        typeof rejectionReason === 'string' && rejectionReason.trim().length > 0
          ? rejectionReason.trim()
          : 'Rejected by admin'

      const historyEntry = {
        status: 'Rejected' as const,
        changedBy: auth.userId,
        changedByName: actorName,
        changedByRole: 'Admin' as const,
        changedAt: new Date(),
        reason: sanitizedReason,
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : undefined,
      }

      const updatedRequest = await BloodRequestModel.findOneAndUpdate(
        { _id: id, status: { $in: ['Pending', 'Approved'] } },
        {
          $set: {
            status: 'Rejected',
            rejectionReason: sanitizedReason,
            approvedDate: undefined,
          },
          $push: {
            statusHistory: historyEntry,
          },
        },
        { returnDocument: 'after' }
      )

      if (!updatedRequest) {
        return NextResponse.json(
          { success: false, error: 'Request was modified concurrently.' },
          { status: 409 }
        )
      }

      // Non-blocking notification to the requesting Hospital
      await sendInAppNotification({
        recipientId: bloodRequest.hospitalId,
        recipientRole: 'Hospital',
        type: 'RequestRejected',
        title: 'Blood Request Rejected',
        message: `Your request for ${bloodRequest.unitsRequired} unit(s) of ${bloodRequest.bloodGroup} was rejected. Reason: ${sanitizedReason}`,
        priority: bloodRequest.priority === 'Emergency' ? 'Emergency' : 'Normal',
        referenceId: updatedRequest._id,
        referenceType: 'BloodRequest',
        eventKey: `request:rejected:${updatedRequest._id}`,
      })

      return NextResponse.json(
        {
          success: true,
          data: updatedRequest,
          message: 'Request rejected.',
        },
        { status: 200 }
      )
    }

    // 3. CANCELLATION (Hospital or Admin)
    if (status === 'Cancelled') {
      // Cannot cancel an already Issued, Partially Issued, or Cancelled request
      if (['Issued', 'Partially Issued', 'Cancelled'].includes(bloodRequest.status)) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot cancel request in status "${bloodRequest.status}".`,
          },
          { status: 400 }
        )
      }

      if ((bloodRequest.unitsIssued || 0) > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot cancel request because ${bloodRequest.unitsIssued} units have already been issued.`,
          },
          { status: 400 }
        )
      }

      const reason =
        typeof cancellationReason === 'string' && cancellationReason.trim()
          ? cancellationReason.trim()
          : auth.role === 'Hospital'
            ? 'Cancelled by hospital requisition department'
            : 'Cancelled by administrator'

      const historyEntry = {
        status: 'Cancelled' as const,
        changedBy: auth.userId,
        changedByName: actorName,
        changedByRole: auth.role as 'Admin' | 'Hospital',
        changedAt: new Date(),
        reason,
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : undefined,
      }

      const updatedRequest = await BloodRequestModel.findOneAndUpdate(
        { _id: id, status: { $in: ['Pending', 'Approved'] } },
        {
          $set: {
            status: 'Cancelled',
            cancellationReason: reason,
          },
          $push: {
            statusHistory: historyEntry,
          },
        },
        { returnDocument: 'after' }
      )

      if (!updatedRequest) {
        return NextResponse.json(
          { success: false, error: 'Request was modified concurrently.' },
          { status: 409 }
        )
      }

      // Non-blocking notification: if cancelled by Hospital, alert Admins; if cancelled by Admin, alert Hospital
      if (auth.role === 'Hospital') {
        await notifyAdmins({
          type: 'RequestCancelled',
          title: 'Blood Request Cancelled by Hospital',
          message: `${actorName} cancelled request for ${bloodRequest.unitsRequired} unit(s) of ${bloodRequest.bloodGroup}. Reason: ${reason}`,
          priority: 'Normal',
          referenceId: updatedRequest._id,
          referenceType: 'BloodRequest',
          eventKey: `request:cancelled:${updatedRequest._id}:admin`,
        })
      } else {
        await sendInAppNotification({
          recipientId: bloodRequest.hospitalId,
          recipientRole: 'Hospital',
          type: 'RequestCancelled',
          title: 'Blood Request Cancelled by Admin',
          message: `Your blood request for ${bloodRequest.unitsRequired} unit(s) of ${bloodRequest.bloodGroup} was cancelled by administrator. Reason: ${reason}`,
          priority: 'Normal',
          referenceId: updatedRequest._id,
          referenceType: 'BloodRequest',
          eventKey: `request:cancelled:${updatedRequest._id}:hospital`,
        })
      }

      return NextResponse.json(
        {
          success: true,
          data: updatedRequest,
          message: 'Request cancelled successfully.',
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported action.' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[requests] Update blood request status error occurred:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update blood request due to a server error.' },
      { status: 500 }
    )
  }
}

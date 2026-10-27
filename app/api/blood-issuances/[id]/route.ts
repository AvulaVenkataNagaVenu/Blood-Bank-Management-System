import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import {
  BloodIssuanceModel,
  BloodRequestModel,
  BloodStockModel,
  InventoryLedgerModel,
  UserModel,
} from '@/lib/schemas'
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
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      )
    }

    if (auth.role === 'Donor') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Donors cannot access blood issuance records.' },
        { status: 403 }
      )
    }

    const { id } = await params
    const issuance = await BloodIssuanceModel.findById(id)

    if (!issuance) {
      return NextResponse.json(
        { success: false, error: 'Blood issuance record not found.' },
        { status: 404 }
      )
    }

    // Hospital Privacy Isolation
    if (auth.role === 'Hospital' && issuance.hospitalId.toString() !== auth.userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not have permission to inspect this issuance record.' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: issuance,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[issuance] Error fetching issuance:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve blood issuance details.' },
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

    if (auth.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only administrators can modify issuance records.' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await req.json()
    const { status, reason } = body

    if (status !== 'Cancelled') {
      return NextResponse.json(
        { success: false, error: 'Only cancellation ("Cancelled") is supported for existing issuance records.' },
        { status: 400 }
      )
    }

    const issuance = await BloodIssuanceModel.findById(id)
    if (!issuance) {
      return NextResponse.json(
        { success: false, error: 'Blood issuance record not found.' },
        { status: 404 }
      )
    }

    if (issuance.status === 'Cancelled') {
      return NextResponse.json(
        { success: false, error: 'This issuance record is already cancelled.' },
        { status: 400 }
      )
    }

    const adminUser = await UserModel.findById(auth.userId)
    const adminName = adminUser?.name || 'Administrator'

    // 1. Mark issuance as Cancelled
    const updatedIssuance = await BloodIssuanceModel.findOneAndUpdate(
      { _id: id, status: 'Issued' },
      { $set: { status: 'Cancelled' } },
      { returnDocument: 'after' }
    )

    if (!updatedIssuance) {
      return NextResponse.json(
        { success: false, error: 'Issuance was modified concurrently.' },
        { status: 409 }
      )
    }

    // 2. Atomically Return Blood Units to Stock
    const stockBefore = await BloodStockModel.findOne({ bloodGroup: issuance.bloodGroup })
    const previousBalance = stockBefore?.unitsAvailable ?? 0

    const updatedStock = await BloodStockModel.findOneAndUpdate(
      { bloodGroup: issuance.bloodGroup },
      {
        $inc: { unitsAvailable: issuance.quantity },
        $set: { lastUpdated: new Date() },
      },
      { returnDocument: 'after' }
    )

    // 3. Rollback Request unitsIssued & update status
    const request = await BloodRequestModel.findById(issuance.requestId)
    if (request) {
      const remainingIssued = Math.max(0, (request.unitsIssued || 0) - issuance.quantity)
      const revertedStatus = remainingIssued > 0 ? 'Partially Issued' : 'Approved'

      await BloodRequestModel.updateOne(
        { _id: request._id },
        {
          $inc: { unitsIssued: -issuance.quantity },
          $set: { status: revertedStatus },
          $push: {
            statusHistory: {
              status: revertedStatus,
              changedBy: auth.userId,
              changedByName: adminName,
              changedByRole: 'Admin',
              changedAt: new Date(),
              reason: typeof reason === 'string' ? reason : 'Issuance cancelled and returned to inventory',
              notes: `Cancelled issuance of ${issuance.quantity} units`,
            },
          },
        }
      )
    }

    // 4. Log Audit Ledger Entry for the Returned Stock
    const ledgerEntry = new InventoryLedgerModel({
      bloodGroup: issuance.bloodGroup,
      movementType: 'Credit',
      quantity: issuance.quantity,
      reason: 'Issuance Cancellation / Return',
      referenceId: issuance._id,
      referenceType: 'BloodIssuance',
      performedBy: auth.userId,
      performedByName: adminName,
      performedByRole: 'Admin',
      previousBalance,
      newBalance: updatedStock?.unitsAvailable ?? (previousBalance + issuance.quantity),
      notes: typeof reason === 'string' ? reason.trim() : 'Blood units returned to inventory following issuance cancellation',
      timestamp: new Date(),
    })
    await ledgerEntry.save()

    // Non-blocking notification to requesting Hospital
    await sendInAppNotification({
      recipientId: issuance.hospitalId,
      recipientRole: 'Hospital',
      type: 'IssuanceCancelled',
      title: 'Blood Issuance Cancelled',
      message: `Issuance of ${issuance.quantity} unit(s) of ${issuance.bloodGroup} has been cancelled and returned to inventory.`,
      priority: request?.priority === 'Emergency' ? 'Emergency' : 'High',
      referenceId: updatedIssuance._id,
      referenceType: 'BloodIssuance',
      eventKey: `issuance:cancelled:${updatedIssuance._id}:hospital`,
    })

    // Non-blocking notification to Administrators
    await notifyAdmins({
      type: 'IssuanceCancelled',
      title: 'Blood Issuance Cancelled & Returned',
      message: `Issuance #${issuance._id.toString().slice(-6)} (${issuance.quantity} units ${issuance.bloodGroup}) to ${issuance.hospitalName} was cancelled by ${adminName}.`,
      priority: request?.priority === 'Emergency' ? 'Emergency' : 'Normal',
      referenceId: updatedIssuance._id,
      referenceType: 'BloodIssuance',
      eventKey: `issuance:cancelled:${updatedIssuance._id}:admin`,
    })

    return NextResponse.json(
      {
        success: true,
        data: updatedIssuance,
        message: 'Issuance successfully cancelled and units returned to blood stock.',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[issuance] Error cancelling issuance:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to cancel issuance record.' },
      { status: 500 }
    )
  }
}

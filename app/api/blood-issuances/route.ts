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
import { sendInAppNotification, checkAndTriggerLowStockAlert } from '@/lib/notifications'
import {
  isPositiveInteger,
  isValidBloodGroup,
  CLINICAL_REVIEW_DISCLAIMER,
} from '@/lib/validation'
import type { ApiResponse } from '@/lib/types'

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      )
    }

    // Role check: ONLY administrators can issue blood units
    if (auth.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only administrators can issue blood products.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { requestId, quantity: rawQuantity, recipientNotes } = body

    if (!requestId || typeof requestId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Approved request ID is required.' },
        { status: 400 }
      )
    }

    const quantity = typeof rawQuantity === 'string' ? parseInt(rawQuantity, 10) : rawQuantity
    if (!isPositiveInteger(quantity)) {
      return NextResponse.json(
        { success: false, error: 'Quantity must be a positive integer greater than 0.' },
        { status: 400 }
      )
    }

    // 1. Fetch Blood Request
    const bloodRequest = await BloodRequestModel.findById(requestId)
    if (!bloodRequest) {
      return NextResponse.json(
        { success: false, error: 'Referenced blood request not found.' },
        { status: 404 }
      )
    }

    // 2. Lifecycle Validation: Can only issue against Approved or Partially Issued requests
    if (bloodRequest.status !== 'Approved' && bloodRequest.status !== 'Partially Issued') {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot issue blood for request with status "${bloodRequest.status}". Request must be Approved or Partially Issued.`,
        },
        { status: 400 }
      )
    }

    // 3. Quota & Duplicate-Issuance Protection:
    // Prevent issuing more than the approved quantity
    const alreadyIssued = bloodRequest.unitsIssued || 0
    const remainingUnits = bloodRequest.unitsRequired - alreadyIssued

    if (remainingUnits <= 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'This request has already been fully issued. Duplicate issuance prevented.',
        },
        { status: 400 }
      )
    }

    if (quantity > remainingUnits) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot issue ${quantity} units. Only ${remainingUnits} units remain unfulfilled on this request.`,
        },
        { status: 400 }
      )
    }

    const adminUser = await UserModel.findById(auth.userId)
    const adminName = adminUser?.name || 'Administrator'

    // ----------------------------------------------------
    // Concurrency Strategy on Standalone MongoDB:
    // Ordered atomic conditional updates with compensatory rollback
    // ----------------------------------------------------

    // STEP 4.1: Atomic Stock Deduction with Inventory Boundary
    const stockBefore = await BloodStockModel.findOne({ bloodGroup: bloodRequest.bloodGroup })
    const previousBalance = stockBefore?.unitsAvailable ?? 0

    if (previousBalance < quantity) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient inventory for blood group ${bloodRequest.bloodGroup}. Currently available: ${previousBalance} units, requested: ${quantity} units.`,
        },
        { status: 400 }
      )
    }

    const updatedStock = await BloodStockModel.findOneAndUpdate(
      {
        bloodGroup: bloodRequest.bloodGroup,
        unitsAvailable: { $gte: quantity },
      },
      {
        $inc: { unitsAvailable: -quantity },
        $set: { lastUpdated: new Date() },
      },
      { returnDocument: 'after' }
    )

    if (!updatedStock) {
      return NextResponse.json(
        {
          success: false,
          error: `Insufficient inventory for blood group ${bloodRequest.bloodGroup}. Stock deduction failed concurrency check.`,
        },
        { status: 400 }
      )
    }

    // STEP 4.2: Atomic Request Allocation
    const newTotalIssued = alreadyIssued + quantity
    const nextRequestStatus = newTotalIssued >= bloodRequest.unitsRequired ? 'Issued' : 'Partially Issued'

    const historyEntry = {
      status: nextRequestStatus as 'Issued' | 'Partially Issued',
      changedBy: auth.userId,
      changedByName: adminName,
      changedByRole: 'Admin' as const,
      changedAt: new Date(),
      notes: `Issued ${quantity} units of ${bloodRequest.bloodGroup} (${newTotalIssued}/${bloodRequest.unitsRequired} fulfilled)`,
    }

    const updatedRequest = await BloodRequestModel.findOneAndUpdate(
      {
        _id: requestId,
        status: { $in: ['Approved', 'Partially Issued'] },
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ['$unitsIssued', 0] }, quantity] },
            '$unitsRequired',
          ],
        },
      },
      {
        $inc: { unitsIssued: quantity },
        $set: {
          status: nextRequestStatus,
        },
        $push: {
          statusHistory: historyEntry,
        },
      },
      { returnDocument: 'after' }
    )

    if (!updatedRequest) {
      // Compensatory Rollback: Return deducted units to stock immediately
      await BloodStockModel.findOneAndUpdate(
        { bloodGroup: bloodRequest.bloodGroup },
        { $inc: { unitsAvailable: quantity } }
      )
      return NextResponse.json(
        {
          success: false,
          error: 'Concurrent issuance error: The request capacity was concurrently modified by another administrator.',
        },
        { status: 409 }
      )
    }

    // STEP 4.3: Persist Issuance Record & Inventory Movement Ledger
    let issuance
    try {
      issuance = new BloodIssuanceModel({
        requestId: bloodRequest._id,
        hospitalId: bloodRequest.hospitalId,
        hospitalName: bloodRequest.hospitalName,
        bloodGroup: bloodRequest.bloodGroup,
        quantity,
        issueDate: new Date(),
        adminId: auth.userId,
        adminName,
        status: 'Issued',
        recipientNotes: typeof recipientNotes === 'string' && recipientNotes.trim() ? recipientNotes.trim() : undefined,
        clinicalReviewNotice: CLINICAL_REVIEW_DISCLAIMER,
      })
      await issuance.save()

      // Record immutable audit ledger entry
      const ledgerEntry = new InventoryLedgerModel({
        bloodGroup: bloodRequest.bloodGroup,
        movementType: 'Deduction',
        quantity,
        reason: 'Hospital Issuance',
        referenceId: issuance._id,
        referenceType: 'BloodIssuance',
        performedBy: auth.userId,
        performedByName: adminName,
        performedByRole: 'Admin',
        previousBalance,
        newBalance: updatedStock.unitsAvailable,
        notes: `Dispatched to ${bloodRequest.hospitalName} for request #${bloodRequest._id.toString().slice(-6)}`,
        timestamp: new Date(),
      })
      await ledgerEntry.save()

      // Non-blocking notification to requesting Hospital
      await sendInAppNotification({
        recipientId: bloodRequest.hospitalId,
        recipientRole: 'Hospital',
        type: 'BloodIssued',
        title: 'Blood Units Issued',
        message: `${quantity} unit(s) of ${bloodRequest.bloodGroup} have been issued for your request.`,
        priority: bloodRequest.priority === 'Emergency' ? 'Emergency' : 'High',
        referenceId: issuance._id,
        referenceType: 'BloodIssuance',
        eventKey: `issuance:create:${issuance._id}`,
      })

      // Non-blocking check for Low / Critical Stock alert to Administrators
      await checkAndTriggerLowStockAlert(bloodRequest.bloodGroup, updatedStock.unitsAvailable)
    } catch (createErr) {
      // Compensate both request and stock on catastrophic error during record creation
      await BloodStockModel.findOneAndUpdate(
        { bloodGroup: bloodRequest.bloodGroup },
        { $inc: { unitsAvailable: quantity } }
      )
      await BloodRequestModel.findOneAndUpdate(
        { _id: requestId },
        {
          $inc: { unitsIssued: -quantity },
          $set: {
            status: alreadyIssued > 0 ? 'Partially Issued' : 'Approved',
          },
        }
      )
      throw createErr
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          issuance,
          request: updatedRequest,
          stockRemaining: updatedStock.unitsAvailable,
        },
        message: `Successfully issued ${quantity} units of ${bloodRequest.bloodGroup} to ${bloodRequest.hospitalName}.`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[issuance] Error issuing blood:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to issue blood due to an internal server error.' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      )
    }

    // Role check: Donors cannot view blood issuances
    if (auth.role === 'Donor') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Donors are not permitted to access blood issuance records.' },
        { status: 403 }
      )
    }

    let query: Record<string, any> = {}

    // Hospital Isolation: Hospital can only query its own issuances
    if (auth.role === 'Hospital') {
      query.hospitalId = auth.userId
    } else if (auth.role === 'Admin') {
      const { searchParams } = new URL(req.url)
      const bloodGroupFilter = searchParams.get('bloodGroup')
      const requestIdFilter = searchParams.get('requestId')
      const hospitalIdFilter = searchParams.get('hospitalId')
      const statusFilter = searchParams.get('status')

      if (bloodGroupFilter && isValidBloodGroup(bloodGroupFilter)) {
        query.bloodGroup = bloodGroupFilter
      }
      if (requestIdFilter) {
        query.requestId = requestIdFilter
      }
      if (hospitalIdFilter) {
        query.hospitalId = hospitalIdFilter
      }
      if (statusFilter && ['Issued', 'Cancelled'].includes(statusFilter)) {
        query.status = statusFilter
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions.' },
        { status: 403 }
      )
    }

    const issuances = await BloodIssuanceModel.find(query).sort({ issueDate: -1 })

    return NextResponse.json(
      {
        success: true,
        data: issuances,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[issuance] Error fetching issuances:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve issuance records.' },
      { status: 500 }
    )
  }
}

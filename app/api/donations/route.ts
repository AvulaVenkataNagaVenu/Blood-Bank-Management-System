import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/db'
import { DonationModel, UserModel, BloodStockModel, InventoryLedgerModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import { isValidBloodGroup, isPositiveInteger } from '@/lib/validation'
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

    // Security: Only authorized administrators can record donations
    if (auth.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only administrators can record blood donations.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { donorId, bloodGroup, units, donationDate, status, notes } = body

    // 1. Validate donor identity
    if (!donorId || typeof donorId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'A valid donor identifier is required.' },
        { status: 400 }
      )
    }

    const donor = await UserModel.findById(donorId)
    if (!donor) {
      return NextResponse.json(
        { success: false, error: 'Donor record not found in system.' },
        { status: 404 }
      )
    }

    if (donor.role !== 'Donor') {
      return NextResponse.json(
        { success: false, error: 'The specified user is not registered as a blood donor.' },
        { status: 400 }
      )
    }

    // 2. Validate blood group
    const targetBloodGroup = bloodGroup || donor.bloodGroup
    if (!isValidBloodGroup(targetBloodGroup)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid blood group (O+, O-, A+, A-, B+, B-, AB+, AB-).',
        },
        { status: 400 }
      )
    }

    // 3. Validate units collected (standard whole blood = 1 unit; apheresis double unit = 2)
    const unitsNum = typeof units === 'string' ? parseInt(units, 10) : units ?? 1
    if (!isPositiveInteger(unitsNum) || unitsNum < 1 || unitsNum > 2) {
      return NextResponse.json(
        { success: false, error: 'Units collected must be 1 or 2 units per donation.' },
        { status: 400 }
      )
    }

    // 4. Validate donation date
    const parsedDate = donationDate ? new Date(donationDate) : new Date()
    if (isNaN(parsedDate.getTime())) {
      return NextResponse.json(
        { success: false, error: 'Invalid donation date provided.' },
        { status: 400 }
      )
    }

    const now = new Date()
    if (parsedDate > now) {
      return NextResponse.json(
        { success: false, error: 'Donation date cannot be set in the future.' },
        { status: 400 }
      )
    }

    // 5. Validate status (Pending or Completed)
    const targetStatus = status || 'Completed'
    if (!['Pending', 'Completed'].includes(targetStatus)) {
      return NextResponse.json(
        { success: false, error: 'Initial donation status must be either "Completed" or "Pending".' },
        { status: 400 }
      )
    }

    const adminUser = await UserModel.findById(auth.userId)
    const adminName = adminUser?.name || 'Administrator'

    const shouldCreditStock = targetStatus === 'Completed'

    // 6. Create Donation Document
    const donation = new DonationModel({
      donorId: donor._id,
      donorName: donor.name,
      donorEmail: donor.email,
      bloodGroup: targetBloodGroup,
      units: unitsNum,
      donationDate: parsedDate,
      status: targetStatus,
      adminId: auth.userId,
      adminName,
      notes: typeof notes === 'string' ? notes.trim() : undefined,
      stockCredited: shouldCreditStock,
    })

    await donation.save()

    // 7. Atomic Inventory Credit (only when completed)
    if (shouldCreditStock) {
      try {
        const stockBefore = await BloodStockModel.findOne({ bloodGroup: targetBloodGroup })
        const previousBalance = stockBefore?.unitsAvailable ?? 0

        const updatedStock = await BloodStockModel.findOneAndUpdate(
          { bloodGroup: targetBloodGroup },
          {
            $inc: { unitsAvailable: unitsNum },
            $set: { lastUpdated: new Date() },
          },
          { returnDocument: 'after', upsert: true }
        )

        // Record audit ledger entry
        const ledgerEntry = new InventoryLedgerModel({
          bloodGroup: targetBloodGroup,
          movementType: 'Credit',
          quantity: unitsNum,
          reason: 'Donation Credit',
          referenceId: donation._id,
          referenceType: 'Donation',
          performedBy: auth.userId,
          performedByName: adminName,
          performedByRole: 'Admin',
          previousBalance,
          newBalance: updatedStock.unitsAvailable,
          notes: `Verified donation bleed credited from donor ${donor.name}`,
          timestamp: new Date(),
        })
        await ledgerEntry.save()
      } catch (stockError) {
        // Rollback donation record on inventory failure
        await DonationModel.findByIdAndDelete(donation._id)
        throw stockError
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: donation,
        message: shouldCreditStock
          ? `Donation recorded successfully and ${unitsNum} unit(s) credited to ${targetBloodGroup} inventory.`
          : 'Donation recorded in Pending status. Stock will be credited upon completion.',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[donations] Error recording donation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to record donation due to an internal server error.' },
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

    // Privacy & Authorization Enforcement:
    // Hospitals are strictly forbidden from viewing donor records
    if (auth.role === 'Hospital') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Hospital accounts cannot access donor records.' },
        { status: 403 }
      )
    }

    let query: Record<string, any> = {}

    // Donor privacy: A donor can ONLY access their own donation records
    if (auth.role === 'Donor') {
      const donorObjectId = mongoose.Types.ObjectId.isValid(auth.userId)
        ? new mongoose.Types.ObjectId(auth.userId)
        : null
      query.donorId = donorObjectId ? { $in: [auth.userId, donorObjectId] } : auth.userId
    } else if (auth.role === 'Admin') {
      // Admin query filters
      const { searchParams } = new URL(req.url)
      const donorIdFilter = searchParams.get('donorId')
      const statusFilter = searchParams.get('status')
      const bloodGroupFilter = searchParams.get('bloodGroup')
      const searchQuery = searchParams.get('search')

      if (donorIdFilter) {
        query.donorId = donorIdFilter
      }

      if (statusFilter && ['Pending', 'Completed', 'Cancelled'].includes(statusFilter)) {
        query.status = statusFilter
      }

      if (bloodGroupFilter && isValidBloodGroup(bloodGroupFilter)) {
        query.bloodGroup = bloodGroupFilter
      }

      if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim().length > 0) {
        const sanitized = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        query.$or = [
          { donorName: { $regex: sanitized, $options: 'i' } },
          { donorEmail: { $regex: sanitized, $options: 'i' } },
        ]
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions.' },
        { status: 403 }
      )
    }

    const donations = await DonationModel.find(query).sort({ donationDate: -1 })

    return NextResponse.json(
      {
        success: true,
        data: donations,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[donations] Error retrieving donations:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve donation history.' },
      { status: 500 }
    )
  }
}

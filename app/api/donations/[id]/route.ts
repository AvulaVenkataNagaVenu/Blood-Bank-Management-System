import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { DonationModel, BloodStockModel, UserModel, InventoryLedgerModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
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

    if (auth.role === 'Hospital') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Hospital accounts cannot access donor records.' },
        { status: 403 }
      )
    }

    const { id } = await params
    const donation = await DonationModel.findById(id)

    if (!donation) {
      return NextResponse.json(
        { success: false, error: 'Donation record not found.' },
        { status: 404 }
      )
    }

    // Donor privacy: A donor can ONLY access their own donation
    if (auth.role === 'Donor' && donation.donorId.toString() !== auth.userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not have permission to view this donation.' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: donation,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[donations] Error getting donation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve donation record.' },
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
    if (!auth || auth.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only administrators can update donation records.' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await req.json()
    const { status, notes } = body

    if (!status || !['Completed', 'Cancelled'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Status update must be either "Completed" or "Cancelled".' },
        { status: 400 }
      )
    }

    const donation = await DonationModel.findById(id)
    if (!donation) {
      return NextResponse.json(
        { success: false, error: 'Donation record not found.' },
        { status: 404 }
      )
    }

    // 1. Finalizing to Completed: Stock Credit Logic
    if (status === 'Completed') {
      // Data Integrity Protection: Prevent duplicate completion and duplicate inventory credit
      if (donation.status === 'Completed' || donation.stockCredited) {
        return NextResponse.json(
          {
            success: false,
            error: 'Donation has already been completed and inventory credited. Duplicate credit prevented.',
          },
          { status: 400 }
        )
      }

      // Atomically update donation record
      const updatedDonation = await DonationModel.findOneAndUpdate(
        { _id: id, status: { $ne: 'Completed' }, stockCredited: false },
        {
          $set: {
            status: 'Completed',
            stockCredited: true,
            notes: typeof notes === 'string' ? notes.trim() : donation.notes,
          },
        },
        { returnDocument: 'after' }
      )

      if (!updatedDonation) {
        return NextResponse.json(
          { success: false, error: 'Donation was already processed concurrently.' },
          { status: 409 }
        )
      }

      // Atomically credit inventory
      const stockBefore = await BloodStockModel.findOne({ bloodGroup: donation.bloodGroup })
      const previousBalance = stockBefore?.unitsAvailable ?? 0

      const updatedStock = await BloodStockModel.findOneAndUpdate(
        { bloodGroup: donation.bloodGroup },
        {
          $inc: { unitsAvailable: donation.units },
          $set: { lastUpdated: new Date() },
        },
        { returnDocument: 'after', upsert: true }
      )

      const adminUser = await UserModel.findById(auth.userId)
      const adminName = adminUser?.name || 'Administrator'

      const ledgerEntry = new InventoryLedgerModel({
        bloodGroup: donation.bloodGroup,
        movementType: 'Credit',
        quantity: donation.units,
        reason: 'Donation Credit',
        referenceId: updatedDonation._id,
        referenceType: 'Donation',
        performedBy: auth.userId,
        performedByName: adminName,
        performedByRole: 'Admin',
        previousBalance,
        newBalance: updatedStock.unitsAvailable,
        notes: `Donation #${id.slice(-6)} finalized from Pending to Completed`,
        timestamp: new Date(),
      })
      await ledgerEntry.save()

      return NextResponse.json(
        {
          success: true,
          data: updatedDonation,
          message: `Donation finalized and ${donation.units} unit(s) credited to ${donation.bloodGroup} inventory.`,
        },
        { status: 200 }
      )
    }

    // 2. Cancellation Logic (with inventory rollback if it had been credited)
    if (status === 'Cancelled') {
      if (donation.status === 'Cancelled') {
        return NextResponse.json(
          { success: false, error: 'Donation is already cancelled.' },
          { status: 400 }
        )
      }

      const wasCredited = donation.stockCredited

      const updatedDonation = await DonationModel.findByIdAndUpdate(
        id,
        {
          $set: {
            status: 'Cancelled',
            stockCredited: false,
            notes: typeof notes === 'string' ? notes.trim() : donation.notes,
          },
        },
        { returnDocument: 'after' }
      )

      // If stock was credited, atomically rollback the units
      if (wasCredited) {
        const stockBefore = await BloodStockModel.findOne({ bloodGroup: donation.bloodGroup })
        const previousBalance = stockBefore?.unitsAvailable ?? 0

        const rolledBackStock = await BloodStockModel.findOneAndUpdate(
          {
            bloodGroup: donation.bloodGroup,
            unitsAvailable: { $gte: donation.units },
          },
          {
            $inc: { unitsAvailable: -donation.units },
            $set: { lastUpdated: new Date() },
          },
          { returnDocument: 'after' }
        )

        const adminUser = await UserModel.findById(auth.userId)
        const adminName = adminUser?.name || 'Administrator'

        const ledgerEntry = new InventoryLedgerModel({
          bloodGroup: donation.bloodGroup,
          movementType: 'Deduction',
          quantity: donation.units,
          reason: 'Discard / Expired',
          referenceId: updatedDonation._id,
          referenceType: 'Donation',
          performedBy: auth.userId,
          performedByName: adminName,
          performedByRole: 'Admin',
          previousBalance,
          newBalance: rolledBackStock?.unitsAvailable ?? Math.max(0, previousBalance - donation.units),
          notes: `Donation #${id.slice(-6)} cancelled - stock reversed`,
          timestamp: new Date(),
        })
        await ledgerEntry.save()
      }

      return NextResponse.json(
        {
          success: true,
          data: updatedDonation,
          message: wasCredited
            ? `Donation cancelled and ${donation.units} unit(s) rolled back from ${donation.bloodGroup} inventory.`
            : 'Donation cancelled.',
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported status action.' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[donations] Error updating donation:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update donation record.' },
      { status: 500 }
    )
  }
}

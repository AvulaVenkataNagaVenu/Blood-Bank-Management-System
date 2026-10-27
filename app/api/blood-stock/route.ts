import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { BloodStockModel, UserModel, InventoryLedgerModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import { checkAndTriggerLowStockAlert } from '@/lib/notifications'
import { isValidBloodGroup, isNonNegativeInteger, VALID_BLOOD_GROUPS } from '@/lib/validation'
import type { ApiResponse } from '@/lib/types'

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    const bloodStock = await BloodStockModel.find().sort({ bloodGroup: 1 })

    // If no stock exists in database, initialize all 8 standard groups with 0 units
    if (bloodStock.length === 0) {
      const initialStock = await BloodStockModel.insertMany(
        VALID_BLOOD_GROUPS.map((bg) => ({
          bloodGroup: bg,
          unitsAvailable: 0,
          lastUpdated: new Date(),
        }))
      )
      return NextResponse.json(
        {
          success: true,
          data: initialStock,
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: bloodStock,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[stock] Get blood stock error occurred')
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve blood stock levels.' },
      { status: 500 }
    )
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth || auth.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only administrators can update blood stock levels.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { bloodGroup, unitsAvailable } = body

    if (!isValidBloodGroup(bloodGroup)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid blood group (O+, O-, A+, A-, B+, B-, AB+, AB-).',
        },
        { status: 400 }
      )
    }

    const units =
      typeof unitsAvailable === 'string' ? parseInt(unitsAvailable, 10) : unitsAvailable

    if (!isNonNegativeInteger(units)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Units available must be a non-negative whole number (0 or greater).',
        },
        { status: 400 }
      )
    }

    if (units > 100000) {
      return NextResponse.json(
        { success: false, error: 'Units exceed maximum inventory limit (100,000).' },
        { status: 400 }
      )
    }

    const stockBefore = await BloodStockModel.findOne({ bloodGroup })
    const previousBalance = stockBefore?.unitsAvailable ?? 0

    const updatedStock = await BloodStockModel.findOneAndUpdate(
      { bloodGroup },
      {
        $set: {
          unitsAvailable: units,
          lastUpdated: new Date(),
        },
      },
      { returnDocument: 'after', upsert: true }
    )

    // If balance changed, log to InventoryLedger
    if (previousBalance !== units) {
      const diff = units - previousBalance
      const adminUser = await UserModel.findById(auth.userId)
      const adminName = adminUser?.name || 'Administrator'

      const ledgerEntry = new InventoryLedgerModel({
        bloodGroup,
        movementType: diff > 0 ? 'Credit' : 'Deduction',
        quantity: Math.abs(diff),
        reason: 'Administrative Correction',
        referenceType: 'ManualAdjustment',
        performedBy: auth.userId,
        performedByName: adminName,
        performedByRole: 'Admin',
        previousBalance,
        newBalance: units,
        notes: `Manual stock level adjustment (${previousBalance} -> ${units})`,
        timestamp: new Date(),
      })
      await ledgerEntry.save()
    }

    // Non-blocking check for Low / Critical Stock alert to Administrators
    await checkAndTriggerLowStockAlert(bloodGroup, units)

    return NextResponse.json(
      {
        success: true,
        data: updatedStock,
        message: `Blood stock for ${bloodGroup} updated to ${units} units.`,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[stock] Update blood stock error occurred')
    return NextResponse.json(
      { success: false, error: 'Failed to update blood stock.' },
      { status: 500 }
    )
  }
}

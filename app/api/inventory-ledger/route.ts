import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { InventoryLedgerModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import {
  isValidBloodGroup,
  isValidMovementType,
  isValidMovementReason,
} from '@/lib/validation'
import type { ApiResponse } from '@/lib/types'

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

    // Role Security: Ordinary users (Donors, Hospitals) have ZERO access to the audit ledger
    if (auth.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only administrators have audit ledger clearance.' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const bloodGroup = searchParams.get('bloodGroup')
    const movementType = searchParams.get('movementType')
    const reason = searchParams.get('reason')
    const referenceType = searchParams.get('referenceType')
    const limitParam = searchParams.get('limit')

    const query: Record<string, any> = {}

    if (bloodGroup && isValidBloodGroup(bloodGroup)) {
      query.bloodGroup = bloodGroup
    }

    if (movementType && isValidMovementType(movementType)) {
      query.movementType = movementType
    }

    if (reason && isValidMovementReason(reason)) {
      query.reason = reason
    }

    if (
      referenceType &&
      ['Donation', 'BloodIssuance', 'BloodRequest', 'ManualAdjustment'].includes(referenceType)
    ) {
      query.referenceType = referenceType
    }

    const limit = limitParam ? Math.min(200, Math.max(1, parseInt(limitParam, 10) || 50)) : 50

    const entries = await InventoryLedgerModel.find(query)
      .sort({ timestamp: -1 })
      .limit(limit)

    return NextResponse.json(
      {
        success: true,
        data: entries,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[ledger] Error querying inventory movement ledger:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve inventory audit ledger.' },
      { status: 500 }
    )
  }
}

// NOTE ON AUDIT IMMUTABILITY:
// This endpoint intentionally exposes ONLY the HTTP GET method.
// Neither POST, PUT, PATCH, nor DELETE are implemented.
// Ordinary users and administrators cannot edit or purge the audit log.

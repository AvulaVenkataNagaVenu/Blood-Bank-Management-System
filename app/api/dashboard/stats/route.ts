import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { UserModel, BloodRequestModel, BloodStockModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import { VALID_BLOOD_GROUPS } from '@/lib/validation'
import type { ApiResponse } from '@/lib/types'

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth || auth.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin access required.' },
        { status: 403 }
      )
    }

    // 1. User metrics
    const donorCount = await UserModel.countDocuments({ role: 'Donor' })
    const hospitalCount = await UserModel.countDocuments({ role: 'Hospital' })

    // 2. Request metrics by status
    const pendingRequests = await BloodRequestModel.countDocuments({ status: 'Pending' })
    const approvedRequests = await BloodRequestModel.countDocuments({ status: 'Approved' })
    const rejectedRequests = await BloodRequestModel.countDocuments({ status: 'Rejected' })
    const totalRequests = pendingRequests + approvedRequests + rejectedRequests

    const requestStats = [
      { status: 'Pending', count: pendingRequests },
      { status: 'Approved', count: approvedRequests },
      { status: 'Rejected', count: rejectedRequests },
    ]

    // 3. Blood stock inventory
    let bloodStock = await BloodStockModel.find().sort({ bloodGroup: 1 })

    // Auto-initialize if empty
    if (bloodStock.length === 0) {
      bloodStock = await BloodStockModel.insertMany(
        VALID_BLOOD_GROUPS.map((bg) => ({
          bloodGroup: bg,
          unitsAvailable: 0,
          lastUpdated: new Date(),
        }))
      )
    }

    // Order bloodStock in canonical standard order: O+, O-, A+, A-, B+, B-, AB+, AB-
    const stockMap = new Map(bloodStock.map((s) => [s.bloodGroup, s.unitsAvailable]))
    const bloodGroupDistribution = VALID_BLOOD_GROUPS.map((bg) => ({
      bloodGroup: bg,
      unitsAvailable: stockMap.get(bg) ?? 0,
    }))

    const totalUnits = bloodGroupDistribution.reduce((sum, item) => sum + item.unitsAvailable, 0)

    // 4. Threshold analysis (Configurable defaults: Critical < 5, Low < 10)
    const criticalStockGroups = bloodGroupDistribution.filter((s) => s.unitsAvailable < 5)
    const lowStockGroups = bloodGroupDistribution.filter(
      (s) => s.unitsAvailable >= 5 && s.unitsAvailable < 10
    )

    return NextResponse.json(
      {
        success: true,
        data: {
          donorCount,
          hospitalCount,
          pendingRequests,
          approvedRequests,
          rejectedRequests,
          totalRequests,
          totalUnits,
          requestStats,
          bloodGroupDistribution,
          criticalStockGroups,
          lowStockGroups,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[stats] Get dashboard stats error occurred')
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve dashboard statistics.' },
      { status: 500 }
    )
  }
}

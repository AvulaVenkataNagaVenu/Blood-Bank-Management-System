import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/db'
import { DonationModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import type { ApiResponse, DonorStats } from '@/lib/types'

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<DonorStats>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      )
    }

    if (auth.role !== 'Donor') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Donor statistics are only accessible to donor accounts.' },
        { status: 403 }
      )
    }

    // Find all completed donations for the authenticated donor
    const donorObjectId = mongoose.Types.ObjectId.isValid(auth.userId)
      ? new mongoose.Types.ObjectId(auth.userId)
      : null
    const donorQuery = donorObjectId ? { $in: [auth.userId, donorObjectId] } : auth.userId

    const completedDonations = await DonationModel.find({
      donorId: donorQuery,
      status: 'Completed',
    }).sort({ donationDate: -1 })

    const count = completedDonations.length
    const totalUnits = completedDonations.reduce((sum, d) => sum + (d.units || 1), 0)
    const livesSaved = count * 3 // Each whole blood unit can potentially save up to 3 lives

    const lastDonation = completedDonations.length > 0 ? completedDonations[0] : null
    const lastDate = lastDonation ? new Date(lastDonation.donationDate) : null

    // 90-Day Standard Whole Blood Cooldown Interval
    const COOLDOWN_DAYS = 90
    let nextEligibleDate: Date | null = null
    let isEligible = true
    let daysRemaining = 0

    if (lastDate) {
      nextEligibleDate = new Date(lastDate.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000)
      const now = new Date()
      isEligible = now.getTime() >= nextEligibleDate.getTime()
      daysRemaining = isEligible
        ? 0
        : Math.ceil((nextEligibleDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
    }

    const donorStats: DonorStats = {
      completedDonations: count,
      totalUnitsDonated: totalUnits,
      livesSavedEstimate: livesSaved,
      lastDonationDate: lastDate ? lastDate.toISOString() : null,
      nextEligibleDateEstimate: nextEligibleDate ? nextEligibleDate.toISOString() : null,
      isEligibleEstimate: isEligible,
      daysRemainingEstimate: daysRemaining,
      medicalNotice:
        'Eligibility dates are mathematical estimates based on a standard 90-day cooldown interval. Official donation eligibility requires in-person hemoglobin testing, vital signs verification, and medical screening at the blood bank.',
    }

    return NextResponse.json(
      {
        success: true,
        data: donorStats,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[donor] Error calculating donor stats:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to calculate donor statistics.' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { DonationSlotModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import {
  STANDARD_TIME_SLOTS,
  DEFAULT_SLOT_CAPACITY,
  isValidSlotDateString,
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

    if (auth.role === 'Hospital') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Hospital accounts cannot access donor appointment slots.' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const dateStr = searchParams.get('date')

    if (!dateStr || !isValidSlotDateString(dateStr)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid future slot date in format YYYY-MM-DD.',
        },
        { status: 400 }
      )
    }

    // Retrieve saved slot documents for this date
    const existingSlots = await DonationSlotModel.find({ slotDate: dateStr })
    const slotMap = new Map(existingSlots.map((s) => [s.timeSlot, s]))

    // Build complete slots response covering all standard time windows
    const slots = STANDARD_TIME_SLOTS.map((timeSlot) => {
      const saved = slotMap.get(timeSlot)
      const maxCapacity = saved?.maxCapacity ?? DEFAULT_SLOT_CAPACITY
      const bookedCount = saved?.bookedCount ?? 0
      const remainingCapacity = Math.max(0, maxCapacity - bookedCount)
      const isClosed = saved?.status === 'Closed'
      const isFull = bookedCount >= maxCapacity || isClosed

      return {
        slotDate: dateStr,
        timeSlot,
        maxCapacity,
        bookedCount,
        remainingCapacity,
        isAvailable: !isFull && !isClosed,
        status: isClosed ? 'Closed' : isFull ? 'Full' : 'Open',
      }
    })

    return NextResponse.json(
      {
        success: true,
        data: slots,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[appointments] Error fetching slots:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve donation slots.' },
      { status: 500 }
    )
  }
}

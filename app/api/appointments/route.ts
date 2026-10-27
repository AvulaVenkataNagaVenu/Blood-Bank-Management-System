import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/db'
import { AppointmentModel, DonationSlotModel, UserModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import { sendInAppNotification, notifyAdmins } from '@/lib/notifications'
import {
  isValidSlotDateString,
  isValidTimeSlot,
  DEFAULT_SLOT_CAPACITY,
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

    // Role check: Only Donors (booking for self) and Admins can create appointments
    if (auth.role !== 'Donor' && auth.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Hospital accounts cannot book donor appointments.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { slotDate, timeSlot, notes, donorId: requestDonorId } = body

    // 1. Determine target donor
    const targetDonorId = auth.role === 'Donor' ? auth.userId : requestDonorId

    if (!targetDonorId || typeof targetDonorId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Donor identifier is required.' },
        { status: 400 }
      )
    }

    const donor = await UserModel.findById(targetDonorId)
    if (!donor || donor.role !== 'Donor') {
      return NextResponse.json(
        { success: false, error: 'Valid registered donor profile not found.' },
        { status: 404 }
      )
    }

    // 2. Validate slot date and time
    if (!isValidSlotDateString(slotDate)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please select a valid future date in format YYYY-MM-DD.',
        },
        { status: 400 }
      )
    }

    if (!isValidTimeSlot(timeSlot)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please select an authorized time slot.',
        },
        { status: 400 }
      )
    }

    // 3. Prevent duplicate active appointments on the same date for the same donor
    const existingActiveBooking = await AppointmentModel.findOne({
      donorId: donor._id,
      slotDate,
      status: { $in: ['Scheduled', 'Confirmed'] },
    })

    if (existingActiveBooking) {
      return NextResponse.json(
        {
          success: false,
          error: `You already have an active appointment scheduled on ${slotDate} (${existingActiveBooking.timeSlot}). Duplicate same-day booking prevented.`,
        },
        { status: 400 }
      )
    }

    // 4. Server-Side Atomic Capacity Enforcement (Supported on Standalone MongoDB)
    // First, ensure the slot document exists with default capacity if not yet created
    await DonationSlotModel.updateOne(
      { slotDate, timeSlot },
      {
        $setOnInsert: {
          slotDate,
          timeSlot,
          maxCapacity: DEFAULT_SLOT_CAPACITY,
          bookedCount: 0,
          status: 'Open',
        },
      },
      { upsert: true }
    )

    // Atomically claim 1 capacity seat:
    // This atomic conditional update succeeds ONLY IF bookedCount < maxCapacity
    // Sequential document locks ensure zero overbooking even with simultaneous requests
    const slotClaim = await DonationSlotModel.findOneAndUpdate(
      {
        slotDate,
        timeSlot,
        status: { $ne: 'Closed' },
        $expr: { $lt: ['$bookedCount', '$maxCapacity'] },
      },
      {
        $inc: { bookedCount: 1 },
      },
      { returnDocument: 'after' }
    )

    if (!slotClaim) {
      return NextResponse.json(
        {
          success: false,
          error: `The selected time slot (${timeSlot} on ${slotDate}) is fully booked or closed. Please choose another time.`,
        },
        { status: 400 }
      )
    }

    // If slot capacity reached, update status to Full
    if (slotClaim.bookedCount >= slotClaim.maxCapacity) {
      await DonationSlotModel.updateOne(
        { _id: slotClaim._id },
        { $set: { status: 'Full' } }
      )
    }

    // 5. Create the Appointment Document
    let appointment
    try {
      appointment = new AppointmentModel({
        donorId: donor._id,
        donorName: donor.name,
        donorEmail: donor.email,
        donorPhone: donor.phone,
        bloodGroup: donor.bloodGroup,
        slotDate,
        timeSlot,
        status: 'Scheduled',
        notes: typeof notes === 'string' ? notes.trim() : undefined,
      })
      await appointment.save()

      // Non-blocking notification to the booking Donor
      await sendInAppNotification({
        recipientId: donor._id,
        recipientRole: 'Donor',
        type: 'AppointmentUpdate',
        title: 'Appointment Scheduled',
        message: `Your blood donation appointment is scheduled for ${slotDate} at ${timeSlot}.`,
        priority: 'Normal',
        referenceId: appointment._id,
        referenceType: 'Appointment',
        eventKey: `appointment:booked:${appointment._id}:donor`,
      })

      // Non-blocking notification to Administrators
      await notifyAdmins({
        type: 'AppointmentUpdate',
        title: 'New Donor Appointment',
        message: `${donor.name} (${donor.bloodGroup || 'Donor'}) booked an appointment for ${slotDate} at ${timeSlot}.`,
        priority: 'Normal',
        referenceId: appointment._id,
        referenceType: 'Appointment',
        eventKey: `appointment:booked:${appointment._id}:admin`,
      })
    } catch (createErr) {
      // Rollback slot capacity claim on unexpected appointment creation error
      await DonationSlotModel.updateOne(
        { slotDate, timeSlot },
        { $inc: { bookedCount: -1 }, $set: { status: 'Open' } }
      )
      throw createErr
    }

    // CRITICAL SAFETY GUARANTEE:
    // Booking an appointment does NOT and must NEVER modify blood inventory levels.

    return NextResponse.json(
      {
        success: true,
        data: appointment,
        message: `Appointment successfully scheduled for ${slotDate} (${timeSlot}).`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[appointments] Error booking appointment:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to schedule appointment due to an internal server error.' },
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

    // Authorization & Privacy: Hospitals cannot access donor appointments
    if (auth.role === 'Hospital') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Hospital accounts cannot access donor appointments.' },
        { status: 403 }
      )
    }

    let query: Record<string, any> = {}

    // Donor privacy scoping: Donors can ONLY view their own appointments
    if (auth.role === 'Donor') {
      const donorObjectId = mongoose.Types.ObjectId.isValid(auth.userId)
        ? new mongoose.Types.ObjectId(auth.userId)
        : null
      query.donorId = donorObjectId ? { $in: [auth.userId, donorObjectId] } : auth.userId
    } else if (auth.role === 'Admin') {
      const { searchParams } = new URL(req.url)
      const statusFilter = searchParams.get('status')
      const slotDateFilter = searchParams.get('slotDate')
      const searchQuery = searchParams.get('search')

      if (statusFilter && ['Scheduled', 'Confirmed', 'Completed', 'Cancelled'].includes(statusFilter)) {
        query.status = statusFilter
      }

      if (slotDateFilter && typeof slotDateFilter === 'string') {
        query.slotDate = slotDateFilter
      }

      if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim().length > 0) {
        const sanitized = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        query.$or = [
          { donorName: { $regex: sanitized, $options: 'i' } },
          { donorEmail: { $regex: sanitized, $options: 'i' } },
          { timeSlot: { $regex: sanitized, $options: 'i' } },
        ]
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions.' },
        { status: 403 }
      )
    }

    const sortOrder =
      auth.role === 'Donor'
        ? { slotDate: -1 as const, timeSlot: -1 as const }
        : { slotDate: 1 as const, timeSlot: 1 as const }

    const appointments = await AppointmentModel.find(query).sort(sortOrder)

    return NextResponse.json(
      {
        success: true,
        data: appointments,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[appointments] Error fetching appointments:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve appointments.' },
      { status: 500 }
    )
  }
}

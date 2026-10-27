import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { AppointmentModel, DonationSlotModel } from '@/lib/schemas'
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

    if (auth.role === 'Hospital') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Hospital accounts cannot access donor appointments.' },
        { status: 403 }
      )
    }

    const { id } = await params
    const appointment = await AppointmentModel.findById(id)

    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found.' },
        { status: 404 }
      )
    }

    // Donor privacy: A donor can ONLY access their own appointment
    if (auth.role === 'Donor' && appointment.donorId.toString() !== auth.userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not have permission to view this appointment.' },
        { status: 403 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: appointment,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[appointments] Error getting appointment:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve appointment record.' },
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

    if (auth.role === 'Hospital') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Hospital accounts cannot manage appointments.' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await req.json()
    const { status, cancellationReason, notes } = body

    if (!status || !['Confirmed', 'Completed', 'Cancelled'].includes(status)) {
      return NextResponse.json(
        { success: false, error: 'Target status must be "Confirmed", "Completed", or "Cancelled".' },
        { status: 400 }
      )
    }

    const appointment = await AppointmentModel.findById(id)
    if (!appointment) {
      return NextResponse.json(
        { success: false, error: 'Appointment not found.' },
        { status: 404 }
      )
    }

    // Role-based authorization rules:
    // Donors can ONLY cancel their OWN appointment. Donors cannot confirm or complete appointments.
    if (auth.role === 'Donor') {
      if (appointment.donorId.toString() !== auth.userId) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: You can only manage your own appointments.' },
          { status: 403 }
        )
      }

      if (status !== 'Cancelled') {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Donors are only permitted to cancel appointments.' },
          { status: 403 }
        )
      }
    }

    // 1. Cancellation Logic (Donor or Admin)
    if (status === 'Cancelled') {
      if (!['Scheduled', 'Confirmed'].includes(appointment.status)) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot cancel an appointment that is already ${appointment.status}.`,
          },
          { status: 400 }
        )
      }

      const reason =
        typeof cancellationReason === 'string' && cancellationReason.trim()
          ? cancellationReason.trim()
          : auth.role === 'Donor'
            ? 'Cancelled by donor'
            : 'Cancelled by administrator'

      const updatedAppointment = await AppointmentModel.findOneAndUpdate(
        { _id: id, status: { $in: ['Scheduled', 'Confirmed'] } },
        {
          $set: {
            status: 'Cancelled',
            cancellationReason: reason,
          },
        },
        { returnDocument: 'after' }
      )

      if (!updatedAppointment) {
        return NextResponse.json(
          { success: false, error: 'Appointment was already modified concurrently.' },
          { status: 409 }
        )
      }

      // Atomically release 1 slot capacity and reopen the slot if it was full
      await DonationSlotModel.updateOne(
        {
          slotDate: appointment.slotDate,
          timeSlot: appointment.timeSlot,
          bookedCount: { $gt: 0 },
        },
        {
          $inc: { bookedCount: -1 },
          $set: { status: 'Open' },
        }
      )

      // Non-blocking notification: if cancelled by Donor, alert Admins; if cancelled by Admin, alert Donor
      if (auth.role === 'Donor') {
        await notifyAdmins({
          type: 'AppointmentUpdate',
          title: 'Appointment Cancelled by Donor',
          message: `${appointment.donorName} cancelled appointment on ${appointment.slotDate} (${appointment.timeSlot}). Reason: ${reason}`,
          priority: 'Normal',
          referenceId: updatedAppointment._id,
          referenceType: 'Appointment',
          eventKey: `appointment:cancelled:${updatedAppointment._id}:admin`,
        })
      } else {
        await sendInAppNotification({
          recipientId: appointment.donorId,
          recipientRole: 'Donor',
          type: 'AppointmentUpdate',
          title: 'Appointment Cancelled',
          message: `Your appointment on ${appointment.slotDate} at ${appointment.timeSlot} was cancelled. Reason: ${reason}`,
          priority: 'Normal',
          referenceId: updatedAppointment._id,
          referenceType: 'Appointment',
          eventKey: `appointment:cancelled:${updatedAppointment._id}:donor`,
        })
      }

      return NextResponse.json(
        {
          success: true,
          data: updatedAppointment,
          message: 'Appointment successfully cancelled and slot released.',
        },
        { status: 200 }
      )
    }

    // 2. Confirmation Logic (Admin only)
    if (status === 'Confirmed') {
      if (auth.role !== 'Admin') {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Only administrators can confirm appointments.' },
          { status: 403 }
        )
      }

      if (appointment.status !== 'Scheduled') {
        return NextResponse.json(
          {
            success: false,
            error: `Only "Scheduled" appointments can be confirmed (current: ${appointment.status}).`,
          },
          { status: 400 }
        )
      }

      const updatedAppointment = await AppointmentModel.findOneAndUpdate(
        { _id: id, status: 'Scheduled' },
        {
          $set: {
            status: 'Confirmed',
            confirmedBy: auth.userId,
            confirmedAt: new Date(),
            notes: typeof notes === 'string' ? notes.trim() : appointment.notes,
          },
        },
        { returnDocument: 'after' }
      )

      // Non-blocking notification to Donor
      await sendInAppNotification({
        recipientId: appointment.donorId,
        recipientRole: 'Donor',
        type: 'AppointmentUpdate',
        title: 'Appointment Confirmed',
        message: `Your blood donation appointment on ${appointment.slotDate} at ${appointment.timeSlot} has been confirmed.`,
        priority: 'Normal',
        referenceId: updatedAppointment._id,
        referenceType: 'Appointment',
        eventKey: `appointment:confirmed:${updatedAppointment._id}`,
      })

      return NextResponse.json(
        {
          success: true,
          data: updatedAppointment,
          message: 'Appointment confirmed.',
        },
        { status: 200 }
      )
    }

    // 3. Completion Logic (Admin only)
    if (status === 'Completed') {
      if (auth.role !== 'Admin') {
        return NextResponse.json(
          { success: false, error: 'Forbidden: Only administrators can complete appointments.' },
          { status: 403 }
        )
      }

      if (!['Scheduled', 'Confirmed'].includes(appointment.status)) {
        return NextResponse.json(
          {
            success: false,
            error: `Cannot complete an appointment that is already ${appointment.status}.`,
          },
          { status: 400 }
        )
      }

      const updatedAppointment = await AppointmentModel.findOneAndUpdate(
        { _id: id, status: { $in: ['Scheduled', 'Confirmed'] } },
        {
          $set: {
            status: 'Completed',
            completedAt: new Date(),
            notes: typeof notes === 'string' ? notes.trim() : appointment.notes,
          },
        },
        { returnDocument: 'after' }
      )

      // CRITICAL SAFETY CHECK:
      // Completing an appointment logs attendance only. Blood stock is ONLY modified
      // through the authorized donation recording workflow (/api/donations).

      // Non-blocking notification to Donor
      await sendInAppNotification({
        recipientId: appointment.donorId,
        recipientRole: 'Donor',
        type: 'AppointmentUpdate',
        title: 'Donation Appointment Completed',
        message: `Thank you for completing your donation appointment on ${appointment.slotDate}. Your contribution helps save lives!`,
        priority: 'Normal',
        referenceId: updatedAppointment._id,
        referenceType: 'Appointment',
        eventKey: `appointment:completed:${updatedAppointment._id}`,
      })

      return NextResponse.json(
        {
          success: true,
          data: updatedAppointment,
          message: 'Appointment marked as completed.',
        },
        { status: 200 }
      )
    }

    return NextResponse.json(
      { success: false, error: 'Unsupported action.' },
      { status: 400 }
    )
  } catch (error) {
    console.error('[appointments] Error updating appointment:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to update appointment record.' },
      { status: 500 }
    )
  }
}

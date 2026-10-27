import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { NotificationModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import { isValidObjectId } from '@/lib/validation'
import type { ApiResponse, Notification } from '@/lib/types'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<ApiResponse<Notification>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      )
    }

    const { id } = await params

    if (!isValidObjectId(id)) {
      return NextResponse.json(
        { success: false, error: 'Bad Request: Invalid notification ID format.' },
        { status: 400 }
      )
    }

    // Check if notification exists
    const existingNotification = await NotificationModel.findById(id)
    if (!existingNotification) {
      return NextResponse.json(
        { success: false, error: 'Not Found: Notification not found.' },
        { status: 404 }
      )
    }

    // Strict ownership verification: cannot modify another recipient's notification
    if (existingNotification.recipientId.toString() !== auth.userId) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: You do not have permission to modify this notification.' },
        { status: 403 }
      )
    }

    // Mark as read and preserve existing readAt timestamp if already read
    const readAt = existingNotification.readAt || new Date()
    const updated = await NotificationModel.findByIdAndUpdate(
      id,
      {
        $set: {
          isRead: true,
          readAt,
        },
      },
      { new: true }
    ).lean()

    return NextResponse.json(
      {
        success: true,
        data: updated as unknown as Notification,
        message: 'Notification marked as read.',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[notifications] PATCH read error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to mark notification as read.' },
      { status: 500 }
    )
  }
}

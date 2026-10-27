import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { NotificationModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import type { ApiResponse } from '@/lib/types'

export async function PATCH(
  req: NextRequest
): Promise<NextResponse<ApiResponse<{ modifiedCount: number }>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      )
    }

    const now = new Date()
    const result = await NotificationModel.updateMany(
      {
        recipientId: auth.userId,
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: now,
        },
      }
    )

    return NextResponse.json(
      {
        success: true,
        data: {
          modifiedCount: result.modifiedCount,
        },
        message: `Successfully marked ${result.modifiedCount} notifications as read.`,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[notifications] PATCH mark-all-read error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to mark all notifications as read.' },
      { status: 500 }
    )
  }
}

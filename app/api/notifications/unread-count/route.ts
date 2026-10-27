import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { NotificationModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import type { ApiResponse } from '@/lib/types'

export async function GET(
  req: NextRequest
): Promise<NextResponse<ApiResponse<{ unreadCount: number; count: number }>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      )
    }

    const unreadCount = await NotificationModel.countDocuments({
      recipientId: auth.userId,
      isRead: false,
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          unreadCount,
          count: unreadCount,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[notifications] GET unread-count error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve unread notification count.' },
      { status: 500 }
    )
  }
}

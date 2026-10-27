import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { NotificationModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import type { ApiResponse, Notification } from '@/lib/types'

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<Notification[]>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(req.url)
    const unreadOnlyParam = searchParams.get('unreadOnly')
    const limitParam = searchParams.get('limit')

    // Notifications are strictly recipient-scoped regardless of user role
    const query: Record<string, any> = {
      recipientId: auth.userId,
    }

    if (unreadOnlyParam === 'true') {
      query.isRead = false
    }

    // Default limit: 20, Max limit: 100, Min limit: 1
    let limit = 20
    if (limitParam !== null) {
      const parsed = parseInt(limitParam, 10)
      if (isNaN(parsed) || parsed < 1) {
        return NextResponse.json(
          { success: false, error: 'Bad Request: Limit must be a positive integer between 1 and 100.' },
          { status: 400 }
        )
      }
      limit = Math.min(parsed, 100)
    }

    const notifications = await NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()

    return NextResponse.json(
      {
        success: true,
        data: notifications as unknown as Notification[],
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[notifications] GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve notifications.' },
      { status: 500 }
    )
  }
}

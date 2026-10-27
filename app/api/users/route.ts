import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { UserModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import type { ApiResponse } from '@/lib/types'

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth || auth.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Admin only' },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(req.url)
    const role = searchParams.get('role')

    let query: any = {}
    if (role) {
      query.role = role
    }

    const users = await UserModel.find(query).select('-password').sort({ createdAt: -1 })

    return NextResponse.json(
      {
        success: true,
        data: users,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Get users error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to get users' },
      { status: 500 }
    )
  }
}

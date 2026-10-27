
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { UserModel } from '@/lib/schemas'
import { verifyToken } from '@/lib/auth'

export interface AuthenticatedRequest extends NextRequest {
  auth?: {
    userId: string
    email: string
    role: string
    credentialVersion?: number
  }
}

export async function verifyAuth(req: NextRequest) {
  try {
    const token = req.cookies.get('authToken')?.value

    if (!token) {
      return null
    }

    const decoded = verifyToken(token)

    if (!decoded || !decoded.userId) {
      return null
    }

    await connectDB()

    const user = await UserModel.findById(decoded.userId)
      .select('_id email role credentialVersion')
      .exec()

    if (!user) {
      return null
    }

    const tokenVersion = decoded.credentialVersion ?? 0
    const currentVersion = user.credentialVersion ?? 0

    // Reject tokens issued before a credential change.
    if (tokenVersion !== currentVersion) {
      return null
    }

    // Do not trust role or email claims if the account has since changed.
    if (decoded.role !== user.role || decoded.email !== user.email) {
      return null
    }

    return {
      ...decoded,
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      credentialVersion: currentVersion,
    }
  } catch (error) {
    console.error('Auth verification error:', error)
    return null
  }
}

export function withAuth(
  handler: (req: NextRequest, auth: any) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    const auth = await verifyAuth(req)

    if (!auth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    return handler(req, auth)
  }
}

export function withRole(...allowedRoles: string[]) {
  return (
    handler: (req: NextRequest, auth: any) => Promise<NextResponse>
  ) => {
    return async (req: NextRequest) => {
      const auth = await verifyAuth(req)

      if (!auth) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        )
      }

      if (!allowedRoles.includes(auth.role)) {
        return NextResponse.json(
          { error: 'Forbidden: Insufficient permissions' },
          { status: 403 }
        )
      }

      return handler(req, auth)
    }
  }
}

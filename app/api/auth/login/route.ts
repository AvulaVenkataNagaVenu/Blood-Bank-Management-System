import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { UserModel } from '@/lib/schemas'
import { verifyPassword, generateToken, setTokenCookie } from '@/lib/auth'
import {
  checkLoginRateLimit,
  recordFailedLogin,
  resetLoginRateLimit,
  normalizeEmail,
} from '@/lib/rate-limit'
import type { ApiResponse } from '@/lib/types'

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password required' },
        { status: 400 }
      )
    }

    const normalizedEmail = normalizeEmail(email)

    // 1. Check Rate Limit (5 failed attempts per 15 minutes per normalized email)
    const rateCheck = checkLoginRateLimit(normalizedEmail)
    if (!rateCheck.allowed) {
      const waitMinutes = Math.ceil(rateCheck.retryAfterSeconds / 60)
      return NextResponse.json(
        {
          success: false,
          error: `Too many failed login attempts. Please wait ${waitMinutes} minute(s) before trying again.`,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateCheck.retryAfterSeconds),
          },
        }
      )
    }

    // 2. Find user with password field included
    const user = await UserModel.findOne({ email: normalizedEmail }).select('+password')

    if (!user) {
      const failStatus = recordFailedLogin(normalizedEmail)
      if (failStatus.isLocked) {
        return NextResponse.json(
          {
            success: false,
            error: 'Too many failed login attempts. Login has been locked for 15 minutes.',
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(failStatus.retryAfterSeconds),
            },
          }
        )
      }

      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // 3. Verify password
    const isPasswordValid = await verifyPassword(password, user.password)
    if (!isPasswordValid) {
      const failStatus = recordFailedLogin(normalizedEmail)
      if (failStatus.isLocked) {
        return NextResponse.json(
          {
            success: false,
            error: 'Too many failed login attempts. Login has been locked for 15 minutes.',
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(failStatus.retryAfterSeconds),
            },
          }
        )
      }

      return NextResponse.json(
        { success: false, error: 'Invalid credentials' },
        { status: 401 }
      )
    }

    // 4. Reset rate limit record upon verified successful authentication
    resetLoginRateLimit(normalizedEmail)

    // Generate token
const token = generateToken(
  user._id.toString(),
  user.email,
  user.role,
  user.credentialVersion ?? 0
)
    // Set cookie
    await setTokenCookie(token)

    // Return user data
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      bloodGroup: user.bloodGroup,
      phone: user.phone,
      hospitalName: user.hospitalName,
    }

    return NextResponse.json(
      {
        success: true,
        data: userData,
        message: 'Login successful',
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { success: false, error: 'Login failed' },
      { status: 500 }
    )
  }
}

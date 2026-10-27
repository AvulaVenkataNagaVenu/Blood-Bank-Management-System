
import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { UserModel } from '@/lib/schemas'
import {
  hashPassword,
  generateToken,
  setTokenCookie,
} from '@/lib/auth'
import {
  isAllowedPublicRole,
  isValidBloodGroup,
  isValidEmail,
} from '@/lib/validation'
import type { ApiResponse } from '@/lib/types'

const PASSWORD_MIN_LENGTH = 8
const PASSWORD_MAX_LENGTH = 128

function isStrongPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}

export async function POST(
  req: NextRequest
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    const body = await req.json()

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: 'Invalid registration request.' },
        { status: 400 }
      )
    }

    const {
      name,
      email,
      password,
      role,
      bloodGroup,
      phone,
      hospitalName,
    } = body

    // Validate name
    if (
      typeof name !== 'string' ||
      name.trim().length < 2 ||
      name.trim().length > 100
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Name must contain between 2 and 100 characters.',
        },
        { status: 400 }
      )
    }

    // Validate and normalize email
    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      !isValidEmail(email.trim()) ||
      email.trim().toLowerCase().endsWith('@example.com')
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid, non-placeholder email address.',
        },
        { status: 400 }
      )
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Enforce password policy on the server
    if (typeof password !== 'string' || !isStrongPassword(password)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Password must be 8–128 characters and include uppercase and lowercase letters, a number, and a special character.',
        },
        { status: 400 }
      )
    }

    // Never allow public Admin registration
    if (!isAllowedPublicRole(role)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Administrator registration is not available publicly. Only Donor and Hospital accounts can register.',
        },
        { status: 400 }
      )
    }

    // Validate role-specific fields
    if (role === 'Donor' && !isValidBloodGroup(bloodGroup)) {
      return NextResponse.json(
        {
          success: false,
          error:
            'A valid blood group (O+, O-, A+, A-, B+, B-, AB+, AB-) is required for donors.',
        },
        { status: 400 }
      )
    }

    if (
      role === 'Hospital' &&
      (typeof hospitalName !== 'string' ||
        hospitalName.trim().length < 2 ||
        hospitalName.trim().length > 150)
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Hospital name must contain between 2 and 150 characters.',
        },
        { status: 400 }
      )
    }

    if (
      phone !== undefined &&
      (typeof phone !== 'string' || phone.trim().length > 20)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid phone number.',
        },
        { status: 400 }
      )
    }

    // Connect only after basic input validation
    await connectDB()

    const existingUser = await UserModel.findOne({
      email: normalizedEmail,
    })

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: 'Email already in use.' },
        { status: 409 }
      )
    }

    // Hash the password before storing it
    const hashedPassword = await hashPassword(password)

    const user = new UserModel({
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      role,
      bloodGroup: role === 'Donor' ? bloodGroup : undefined,
      phone: typeof phone === 'string' ? phone.trim() : undefined,
      hospitalName:
        role === 'Hospital' ? hospitalName.trim() : undefined,
    })

    await user.save()

    const token = generateToken(
      user._id.toString(),
      user.email,
      user.role
    )

    await setTokenCookie(token)

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
        message: 'Registration successful',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Registration request failed:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Registration failed due to a server error.',
      },
      { status: 500 }
    )
  }
}

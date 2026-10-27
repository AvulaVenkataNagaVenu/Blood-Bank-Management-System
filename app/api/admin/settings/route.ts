import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { UserModel } from '@/lib/schemas'
import {
  verifyPassword,
  hashPassword,
  generateToken,
  setTokenCookie,
} from '@/lib/auth'
import { verifyAuth } from '@/middleware/auth'
import { normalizeEmail } from '@/lib/rate-limit'
import type { ApiResponse } from '@/lib/types'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function PATCH(
  req: NextRequest
): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    // Require a valid, current Admin session.
    const auth = await verifyAuth(req)

    if (!auth) {
      return NextResponse.json(
        {
          success: false,
          error: 'Your session is invalid or expired. Please log in again.',
        },
        { status: 401 }
      )
    }

    if (auth.role !== 'Admin') {
      return NextResponse.json(
        {
          success: false,
          error: 'Only administrators can change these credentials.',
        },
        { status: 403 }
      )
    }

    const body = await req.json()

    const currentPassword =
      typeof body.currentPassword === 'string'
        ? body.currentPassword
        : ''

    const newEmail =
      typeof body.newEmail === 'string'
        ? normalizeEmail(body.newEmail)
        : ''

    const newPassword =
      typeof body.newPassword === 'string'
        ? body.newPassword
        : ''

    const confirmPassword =
      typeof body.confirmPassword === 'string'
        ? body.confirmPassword
        : ''

    if (
      !currentPassword ||
      !newEmail ||
      !newPassword ||
      !confirmPassword
    ) {
      return NextResponse.json(
        { success: false, error: 'All fields are required.' },
        { status: 400 }
      )
    }

    if (!EMAIL_REGEX.test(newEmail) || newEmail.length > 254) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please enter a valid email address.',
        },
        { status: 400 }
      )
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      return NextResponse.json(
        {
          success: false,
          error: 'The new password must be between 8 and 128 characters.',
        },
        { status: 400 }
      )
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'The new password and confirmation do not match.',
        },
        { status: 400 }
      )
    }

    // Retrieve the existing Admin account, including its password hash.
    const user = await UserModel.findById(auth.userId)
      .select('+password')
      .exec()

    if (!user || user.role !== 'Admin') {
      return NextResponse.json(
        { success: false, error: 'Admin account not found.' },
        { status: 404 }
      )
    }

    // Verify the current password before changing anything.
    const passwordIsValid = await verifyPassword(
      currentPassword,
      user.password
    )

    if (!passwordIsValid) {
      return NextResponse.json(
        {
          success: false,
          error: 'The current password is incorrect.',
        },
        { status: 401 }
      )
    }

    // Prevent changing the password to the same value.
    const samePassword = await verifyPassword(
      newPassword,
      user.password
    )

    if (samePassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'Choose a password different from your current password.',
        },
        { status: 400 }
      )
    }

    // Check whether another account already uses this email.
    const existingUser = await UserModel.findOne({
      email: newEmail,
      _id: { $ne: user._id },
    })
      .select('_id')
      .exec()

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: 'That email address is already in use.',
        },
        { status: 409 }
      )
    }

    const hashedPassword = await hashPassword(newPassword)
    const currentVersion = user.credentialVersion ?? 0
    const nextVersion = currentVersion + 1

    // Match the current credential version. Support older accounts
    // whose credentialVersion field has not yet been stored.
    const versionCondition = {
      $or: [
        { credentialVersion: currentVersion },
        ...(currentVersion === 0
          ? [{ credentialVersion: { $exists: false } }]
          : []),
      ],
    }

    let updatedUser

    try {
      updatedUser = await UserModel.findOneAndUpdate(
        {
          _id: user._id,
          role: 'Admin',
          ...versionCondition,
        },
        {
          $set: {
            email: newEmail,
            password: hashedPassword,
            credentialVersion: nextVersion,
          },
        },
        {
          returnDocument: 'after',
          runValidators: true,
        }
      )
        .select(
          '_id name email role bloodGroup phone hospitalName credentialVersion'
        )
        .exec()
    } catch (error: any) {
      if (error?.code === 11000) {
        return NextResponse.json(
          {
            success: false,
            error: 'That email address is already in use.',
          },
          { status: 409 }
        )
      }

      throw error
    }

    if (!updatedUser) {
      console.error(
        '[Admin Settings] Conditional update matched no account.',
        {
          userId: user._id.toString(),
          credentialVersion: currentVersion,
        }
      )

      return NextResponse.json(
        {
          success: false,
          error:
            'The account could not be updated because its stored state did not match. No credentials were changed by this update. Please refresh your session and try again.',
        },
        { status: 409 }
      )
    }

    // Issue a fresh token for the updated credentials and version.
    const token = generateToken(
      updatedUser._id.toString(),
      updatedUser.email,
      updatedUser.role,
      updatedUser.credentialVersion ?? nextVersion
    )

    await setTokenCookie(token)

    return NextResponse.json(
      {
        success: true,
        message: 'Admin credentials updated successfully.',
        data: {
          _id: updatedUser._id,
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          bloodGroup: updatedUser.bloodGroup,
          phone: updatedUser.phone,
          hospitalName: updatedUser.hospitalName,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Admin credential update error:', error)

    return NextResponse.json(
      {
        success: false,
        error: 'Unable to update Admin credentials.',
      },
      { status: 500 }
    )
  }
}

import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import type { AuthToken } from './types'
import { cookies } from 'next/headers'

/**
 * Retrieves and validates the JWT secret.
 * Production requires a strong JWT_SECRET.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET

  if (process.env.NODE_ENV === 'production') {
    if (
      !secret ||
      secret.trim().length < 32 ||
      secret.trim() === 'your-secret-key-change-this'
    ) {
      throw new Error(
        '[Security Error] In production, JWT_SECRET must be defined, ' +
          'at least 32 characters long, and not an insecure default.'
      )
    }

    return secret.trim()
  }

  return secret && secret.trim().length > 0
    ? secret.trim()
    : 'dev-fallback-secret-key-only-not-for-production-use-32chars'
}

const TOKEN_EXPIRY = '24h'

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

export async function verifyPassword(
  password: string,
  hashedPassword: string
): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword)
}

/**
 * Generates a JWT containing the user's credential version.
 * Existing users without a stored version use version 0.
 */
export function generateToken(
  userId: string,
  email: string,
  role: string,
  credentialVersion = 0
): string {
  const secret = getJwtSecret()

  return jwt.sign(
    {
      userId,
      email,
      role,
      credentialVersion,
    },
    secret,
    {
      expiresIn: TOKEN_EXPIRY,
    }
  )
}

export function verifyToken(token: string): AuthToken | null {
  try {
    const secret = getJwtSecret()
    const decoded = jwt.verify(token, secret) as AuthToken

    return decoded
  } catch {
    return null
  }
}

export async function setTokenCookie(token: string): Promise<void> {
  const cookieStore = await cookies()

  cookieStore.set('authToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60,
    path: '/',
  })
}

export async function getTokenFromCookie(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('authToken')?.value || null
}

export async function clearTokenCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('authToken')
}

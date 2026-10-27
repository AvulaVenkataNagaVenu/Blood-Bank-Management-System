import { NextRequest, NextResponse } from 'next/server'

const VALID_ROLES = ['Admin', 'Donor', 'Hospital'] as const
type ValidRole = (typeof VALID_ROLES)[number]

interface ValidatedJwtPayload {
  userId: string
  email: string
  role: ValidRole
  exp: number
}

function parseJwtPayload(token: string): ValidatedJwtPayload | null {
  try {
    if (typeof token !== 'string') return null
    const parts = token.split('.')
    if (parts.length !== 3) return null

    // Base64Url decode payload
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(base64)
    const jsonStr = decodeURIComponent(
      Array.prototype.map
        .call(binary, (char: string) => '%' + ('00' + char.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    )
    const parsed = JSON.parse(jsonStr)

    // Strict structure and role validation
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.userId !== 'string' || parsed.userId.trim().length === 0) return null
    if (typeof parsed.email !== 'string' || !parsed.email.includes('@')) return null
    if (typeof parsed.role !== 'string' || !VALID_ROLES.includes(parsed.role as ValidRole)) return null
    if (typeof parsed.exp !== 'number' || isNaN(parsed.exp) || parsed.exp <= 0) return null

    return {
      userId: parsed.userId.trim(),
      email: parsed.email.trim(),
      role: parsed.role as ValidRole,
      exp: parsed.exp,
    }
  } catch {
    return null
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('authToken')?.value
  const payload = token ? parseJwtPayload(token) : null

  const isTokenExpired = payload?.exp ? payload.exp * 1000 < Date.now() : true
  const isAuthenticated = Boolean(payload && !isTokenExpired)

  const isAuthPage = pathname === '/' || pathname === '/register'
  const isAdminPage = pathname.startsWith('/admin')
  const isDonorPage = pathname.startsWith('/donor')
  const isHospitalPage = pathname.startsWith('/hospital')

  // 1. If trying to access public auth page with active valid session, redirect to appropriate dashboard
  if (isAuthPage && isAuthenticated && payload) {
    if (payload.role === 'Admin') {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    if (payload.role === 'Donor') {
      return NextResponse.redirect(new URL('/donor', request.url))
    }
    if (payload.role === 'Hospital') {
      return NextResponse.redirect(new URL('/hospital', request.url))
    }
  }

  // 2. If trying to access protected page without valid session, redirect to login
  if ((isAdminPage || isDonorPage || isHospitalPage) && !isAuthenticated) {
    const response = NextResponse.redirect(new URL('/', request.url))
    if (token) {
      // Clean up invalid, malformed, or expired cookie
      response.cookies.delete('authToken')
    }
    return response
  }

  // 3. Role-based boundary enforcement
  if (isAuthenticated && payload) {
    if (isAdminPage && payload.role !== 'Admin') {
      const redirectPath = payload.role === 'Donor' ? '/donor' : '/hospital'
      return NextResponse.redirect(new URL(redirectPath, request.url))
    }

    if (isDonorPage && payload.role !== 'Donor') {
      const redirectPath = payload.role === 'Admin' ? '/admin' : '/hospital'
      return NextResponse.redirect(new URL(redirectPath, request.url))
    }

    if (isHospitalPage && payload.role !== 'Hospital') {
      const redirectPath = payload.role === 'Admin' ? '/admin' : '/donor'
      return NextResponse.redirect(new URL(redirectPath, request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/register',
    '/admin/:path*',
    '/donor/:path*',
    '/hospital/:path*',
  ],
}

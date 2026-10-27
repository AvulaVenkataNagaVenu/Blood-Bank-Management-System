/**
 * In-Memory Sliding-Window Login Rate Limiter
 *
 * POLICY SPECIFICATION:
 * - Window: 15 minutes (900 seconds)
 * - Maximum Failed Attempts: 5 attempts per window
 * - Identifier: Normalized email address (email.trim().toLowerCase())
 *
 * ARCHITECTURAL DESIGN & SECURITY GUARANTEES:
 * 1. Spoof-Proof Account Defense:
 *    Rate limiting is enforced strictly by normalized email address. Because raw
 *    HTTP forwarding headers (e.g. X-Forwarded-For, X-Real-IP) can be arbitrarily
 *    forged or cycled by attackers when no upstream reverse proxy strips untrusted
 *    headers, an IP-only control can be trivially bypassed or risk denying service
 *    to entire hospital/clinic networks sharing an egress NAT. The normalized email
 *    bucket guarantees account protection against brute-force password guessing
 *    regardless of how many client headers or IP addresses an adversary rotates.
 *
 * 2. Zero-Dependency & Zero-Database Impact:
 *    Implemented in pure TypeScript using an in-memory Map. No external packages
 *    are required, and zero read/write operations are dispatched to MongoDB,
 *    protecting database connection limits and database performance.
 *
 * 3. Multi-Instance Limitation Notice:
 *    This in-memory state is maintained per Node.js runtime process. In a multi-instance
 *    autoscaled or cluster deployment, each process maintains its own memory table.
 *    For horizontal scale-out where global cluster-wide state synchronization is required,
 *    an external distributed cache (such as Redis or Upstash) should be connected.
 */

interface RateLimitRecord {
  failedAttempts: number
  firstFailedAt: number
  lockedUntil: number
}

const MAX_FAILED_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000 // 15 minutes in milliseconds

// Global cache to persist across Next.js dev reloads while remaining bounded
const rateLimitMap: Map<string, RateLimitRecord> =
  (global as any).__loginRateLimitMap || new Map<string, RateLimitRecord>()

if (process.env.NODE_ENV !== 'production') {
  ;(global as any).__loginRateLimitMap = rateLimitMap
}

/**
 * Normalizes an email identifier to ensure case-insensitive, whitespace-trimmed matching.
 */
export function normalizeEmail(email: unknown): string {
  if (typeof email !== 'string') return ''
  return email.trim().toLowerCase()
}

/**
 * Checks whether the given email identifier is currently permitted to attempt login.
 *
 * Returns:
 * - allowed: boolean indicating whether the attempt can proceed.
 * - retryAfterSeconds: seconds remaining on the lock window if blocked.
 * - remainingAttempts: remaining failed attempts before lockout occurs.
 */
export function checkLoginRateLimit(rawEmail: unknown): {
  allowed: boolean
  retryAfterSeconds: number
  remainingAttempts: number
} {
  const email = normalizeEmail(rawEmail)
  if (!email) {
    return { allowed: true, retryAfterSeconds: 0, remainingAttempts: MAX_FAILED_ATTEMPTS }
  }

  const now = Date.now()
  const record = rateLimitMap.get(email)

  if (!record) {
    return { allowed: true, retryAfterSeconds: 0, remainingAttempts: MAX_FAILED_ATTEMPTS }
  }

  // If the lockout window has elapsed, reset the record
  if (record.lockedUntil > 0) {
    if (now >= record.lockedUntil) {
      rateLimitMap.delete(email)
      return { allowed: true, retryAfterSeconds: 0, remainingAttempts: MAX_FAILED_ATTEMPTS }
    }
    const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000)
    return { allowed: false, retryAfterSeconds, remainingAttempts: 0 }
  }

  // If the tracking window has elapsed without lockout, reset the record
  if (now - record.firstFailedAt > WINDOW_MS) {
    rateLimitMap.delete(email)
    return { allowed: true, retryAfterSeconds: 0, remainingAttempts: MAX_FAILED_ATTEMPTS }
  }

  // Currently within window and not locked
  const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - record.failedAttempts)
  return { allowed: true, retryAfterSeconds: 0, remainingAttempts: remaining }
}

/**
 * Records a failed login attempt for the specified email identifier.
 * Automatically locks the identifier for 15 minutes upon reaching 5 failures.
 */
export function recordFailedLogin(rawEmail: unknown): {
  isLocked: boolean
  retryAfterSeconds: number
  remainingAttempts: number
} {
  const email = normalizeEmail(rawEmail)
  if (!email) {
    return { isLocked: false, retryAfterSeconds: 0, remainingAttempts: MAX_FAILED_ATTEMPTS }
  }

  const now = Date.now()
  let record = rateLimitMap.get(email)

  // Prune stale entries if map grows
  if (rateLimitMap.size > 1000) {
    for (const [key, val] of rateLimitMap.entries()) {
      if (now > val.lockedUntil && now - val.firstFailedAt > WINDOW_MS) {
        rateLimitMap.delete(key)
      }
    }
  }

  if (!record || (now - record.firstFailedAt > WINDOW_MS && record.lockedUntil <= 0)) {
    record = {
      failedAttempts: 1,
      firstFailedAt: now,
      lockedUntil: 0,
    }
    rateLimitMap.set(email, record)
    return { isLocked: false, retryAfterSeconds: 0, remainingAttempts: MAX_FAILED_ATTEMPTS - 1 }
  }

  record.failedAttempts += 1

  if (record.failedAttempts >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = now + WINDOW_MS
    rateLimitMap.set(email, record)
    const retryAfterSeconds = Math.ceil(WINDOW_MS / 1000)
    return { isLocked: true, retryAfterSeconds, remainingAttempts: 0 }
  }

  rateLimitMap.set(email, record)
  const remainingAttempts = Math.max(0, MAX_FAILED_ATTEMPTS - record.failedAttempts)
  return { isLocked: false, retryAfterSeconds: 0, remainingAttempts }
}

/**
 * Resets the failed attempts record for an email upon successful authentication.
 */
export function resetLoginRateLimit(rawEmail: unknown): void {
  const email = normalizeEmail(rawEmail)
  if (!email) return
  rateLimitMap.delete(email)
}

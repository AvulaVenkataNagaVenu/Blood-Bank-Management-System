
import type { BloodGroup, UserRole } from './types'

export const VALID_BLOOD_GROUPS: readonly BloodGroup[] = [
  'O+',
  'O-',
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
]

export const ALLOWED_PUBLIC_ROLES: readonly ('Donor' | 'Hospital')[] = [
  'Donor',
  'Hospital',
]

export function isValidBloodGroup(group: unknown): group is BloodGroup {
  return (
    typeof group === 'string' &&
    (VALID_BLOOD_GROUPS as readonly string[]).includes(group)
  )
}

export function isAllowedPublicRole(
  role: unknown
): role is 'Donor' | 'Hospital' {
  return (
    typeof role === 'string' &&
    (ALLOWED_PUBLIC_ROLES as readonly string[]).includes(role)
  )
}

export function isValidRole(role: unknown): role is UserRole {
  return role === 'Admin' || role === 'Donor' || role === 'Hospital'
}

export function isPositiveInteger(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val > 0
}

export function isNonNegativeInteger(val: unknown): val is number {
  return typeof val === 'number' && Number.isInteger(val) && val >= 0
}

/**
 * Checks basic email syntax and rejects common placeholder addresses.
 * This does not verify that the mailbox exists or belongs to the user.
 */
export function isValidEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false

  const normalizedEmail = email.trim().toLowerCase()

  if (normalizedEmail.length === 0 || normalizedEmail.length > 254) {
    return false
  }

  // Reject whitespace, missing local/domain parts, and multiple @ signs.
  const emailRegex =
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i

  if (!emailRegex.test(normalizedEmail)) return false

  // Block common example/placeholder domains.
  const blockedDomains = new Set([
    'example.com',
    'example.org',
    'example.net',
    'test.com',
    'invalid',
    'localhost',
  ])

  const domain = normalizedEmail.split('@')[1]

  return !blockedDomains.has(domain)
}

export const STANDARD_TIME_SLOTS = [
  '09:00 - 10:00',
  '10:00 - 11:00',
  '11:00 - 12:00',
  '13:00 - 14:00',
  '14:00 - 15:00',
  '15:00 - 16:00',
] as const

export const DEFAULT_SLOT_CAPACITY = 4

export function isValidTimeSlot(slot: unknown): boolean {
  return (
    typeof slot === 'string' &&
    (STANDARD_TIME_SLOTS as readonly string[]).includes(slot)
  )
}

export function isValidSlotDateString(dateStr: unknown): boolean {
  if (typeof dateStr !== 'string') return false

  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  const parsed = new Date(year, month - 1, day)

  // Reject impossible dates such as 2026-02-31.
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return false
  }

  // Cannot be in the past (allow today onwards).
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return parsed.getTime() >= today.getTime()
}

export const VALID_REQUEST_PRIORITIES = ['Normal', 'Emergency'] as const

export function isValidRequestPriority(
  priority: unknown
): priority is 'Normal' | 'Emergency' {
  return (
    typeof priority === 'string' &&
    (VALID_REQUEST_PRIORITIES as readonly string[]).includes(priority)
  )
}

export const VALID_REQUEST_STATUSES = [
  'Pending',
  'Approved',
  'Partially Issued',
  'Issued',
  'Rejected',
  'Cancelled',
] as const

export function isValidRequestStatus(status: unknown): boolean {
  return (
    typeof status === 'string' &&
    (VALID_REQUEST_STATUSES as readonly string[]).includes(status)
  )
}

export const VALID_MOVEMENT_TYPES = ['Credit', 'Deduction'] as const

export function isValidMovementType(
  type: unknown
): type is 'Credit' | 'Deduction' {
  return (
    typeof type === 'string' &&
    (VALID_MOVEMENT_TYPES as readonly string[]).includes(type)
  )
}

export const VALID_MOVEMENT_REASONS = [
  'Donation Credit',
  'Hospital Issuance',
  'Administrative Correction',
  'Discard / Expired',
  'Issuance Cancellation / Return',
] as const

export function isValidMovementReason(reason: unknown): boolean {
  return (
    typeof reason === 'string' &&
    (VALID_MOVEMENT_REASONS as readonly string[]).includes(reason)
  )
}

export function isValidObjectId(id: unknown): boolean {
  if (typeof id !== 'string') return false
  return /^[0-9a-fA-F]{24}$/.test(id.trim())
}

export const CLINICAL_REVIEW_DISCLAIMER =
  'Administrative release of blood products does not constitute medical transfusion authorization. Clinical compatibility, ABO/Rh cross-matching, bedside identity verification, and transfusion monitoring must be performed by qualified medical professionals in accordance with applicable blood safety protocols.'

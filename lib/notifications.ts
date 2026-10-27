import { connectDB } from './db.ts'
import { NotificationModel, UserModel } from './schemas.ts'
import type {
  NotificationType,
  NotificationPriority,
  NotificationReferenceType,
  UserRole,
  BloodGroup,
} from './types.ts'
import type { Types } from 'mongoose'

/**
 * Input parameters for creating a single in-app notification.
 */
export interface CreateNotificationInput {
  recipientId: string | Types.ObjectId
  recipientRole?: UserRole
  type: NotificationType
  title: string
  message: string
  referenceId?: string | Types.ObjectId
  referenceType?: NotificationReferenceType
  priority?: NotificationPriority
  eventKey: string
}

/**
 * Input parameters for notifying all administrators.
 */
export interface NotifyAdminsInput {
  type: NotificationType
  title: string
  message: string
  referenceId?: string | Types.ObjectId
  referenceType?: NotificationReferenceType
  priority?: NotificationPriority
  eventKey: string
}

/**
 * Result returned by notification creation operations.
 */
export interface NotificationOperationResult {
  success: boolean
  created: boolean
  id?: string
  error?: string
}

/**
 * Sends an in-app notification to a specified recipient with strict idempotency
 * and non-blocking error handling.
 *
 * -------------------------------------------------------------------------
 * ARCHITECTURE & RESILIENCE GUARANTEES:
 * -------------------------------------------------------------------------
 * 1. Non-Blocking Execution:
 *    This function wraps all database queries in a try/catch block and returns
 *    a structured result object instead of throwing. Any operational failure
 *    (e.g., transient network glitch, database lock) is caught and logged,
 *    ensuring that critical parent transactions (such as blood stock decrements,
 *    issuance records, and donation credits) are NEVER rolled back or interrupted.
 *
 * 2. Strict Recipient/Event Idempotency:
 *    Enforced via a unique compound index on `{ recipientId: 1, eventKey: 1 }`
 *    and atomic MongoDB `$setOnInsert` upserts. If an identical eventKey for
 *    the same recipient is processed concurrently or re-sent, MongoDB updates
 *    nothing (`matchedCount: 1, upsertedCount: 0`) and existing read statuses
 *    or timestamps are preserved. Duplicate key errors (E11000) from concurrent
 *    races are safely caught and treated as successful idempotent operations.
 *
 * 3. Failure Recovery & Retry Strategy:
 *    Because operations are strictly idempotent, any notification that fails
 *    due to a temporary disruption can be safely retried by re-calling this
 *    function with the original payload and eventKey. There is zero risk of
 *    generating duplicate notifications on replay.
 * -------------------------------------------------------------------------
 */
export async function sendInAppNotification(
  input: CreateNotificationInput
): Promise<NotificationOperationResult> {
  try {
    await connectDB()

    const filter = {
      recipientId: input.recipientId,
      eventKey: input.eventKey.trim(),
    }

    const update = {
      $setOnInsert: {
        recipientId: input.recipientId,
        recipientRole: input.recipientRole,
        type: input.type,
        title: input.title.trim(),
        message: input.message.trim(),
        referenceId: input.referenceId,
        referenceType: input.referenceType,
        priority: input.priority || 'Normal',
        isRead: false,
        readAt: null,
        eventKey: input.eventKey.trim(),
      },
    }

    const result = await NotificationModel.updateOne(filter, update, { upsert: true })

    const wasCreated = Boolean(result.upsertedCount && result.upsertedCount > 0)
    const notificationId = result.upsertedId ? result.upsertedId.toString() : undefined

    return {
      success: true,
      created: wasCreated,
      id: notificationId,
    }
  } catch (error: any) {
    // E11000 duplicate key error indicates another concurrent worker created the notification
    if (error?.code === 11000) {
      return {
        success: true,
        created: false,
      }
    }

    console.error('[NotificationService] Non-blocking failure creating notification:', {
      recipientId: input.recipientId?.toString(),
      eventKey: input.eventKey,
      type: input.type,
      error: error?.message || error,
    })

    return {
      success: false,
      created: false,
      error: error?.message || 'Failed to create notification',
    }
  }
}

/**
 * Notifies all active administrators of a system event (e.g. low stock alerts,
 * emergency blood requests, new donations).
 *
 * Each administrator receives an individual notification document with the same
 * eventKey. Because the unique compound index is `{ recipientId: 1, eventKey: 1 }`,
 * each administrator's delivery is independent, idempotent, and maintains its own
 * read state.
 */
export async function notifyAdmins(
  input: NotifyAdminsInput
): Promise<{ success: boolean; totalAttempted: number; totalCreated: number; errors: string[] }> {
  try {
    await connectDB()

    const admins = await UserModel.find({ role: 'Admin' }, '_id role').lean()

    if (!admins || admins.length === 0) {
      return { success: true, totalAttempted: 0, totalCreated: 0, errors: [] }
    }

    const results = await Promise.allSettled(
      admins.map((admin: any) =>
        sendInAppNotification({
          recipientId: admin._id,
          recipientRole: 'Admin',
          type: input.type,
          title: input.title,
          message: input.message,
          referenceId: input.referenceId,
          referenceType: input.referenceType,
          priority: input.priority,
          eventKey: input.eventKey,
        })
      )
    )

    let totalCreated = 0
    const errors: string[] = []

    for (const res of results) {
      if (res.status === 'fulfilled') {
        if (res.value.created) totalCreated++
        if (!res.value.success && res.value.error) errors.push(res.value.error)
      } else {
        errors.push(res.reason?.message || 'Admin notification failed')
      }
    }

    return {
      success: errors.length === 0,
      totalAttempted: admins.length,
      totalCreated,
      errors,
    }
  } catch (error: any) {
    console.error('[NotificationService] Non-blocking failure notifying admins:', {
      eventKey: input.eventKey,
      type: input.type,
      error: error?.message || error,
    })

    return {
      success: false,
      totalAttempted: 0,
      totalCreated: 0,
      errors: [error?.message || 'Failed to notify admins'],
    }
  }
}

/**
 * Retries a previously failed or deferred notification payload.
 *
 * Safe to call at any time because sendInAppNotification guarantees idempotency
 * via the recipientId + eventKey unique compound index.
 */
export async function retryNotification(
  input: CreateNotificationInput
): Promise<NotificationOperationResult> {
  return sendInAppNotification(input)
}

/**
 * Checks if inventory for a blood group has fallen below configured thresholds
 * and sends an idempotent low stock alert to all administrators.
 *
 * Thresholds:
 * - Critical: < 5 units (Priority: Emergency)
 * - Low: < 10 units (Priority: High)
 *
 * Duplicate Alert Suppression:
 * Event key incorporates blood group, severity level ('critical' | 'low'), and the current calendar date (YYYY-MM-DD).
 * Multiple deductions or unchanged levels on the same day will match the unique compound index
 * and be suppressed automatically by MongoDB.
 */
export async function checkAndTriggerLowStockAlert(
  bloodGroup: BloodGroup,
  unitsAvailable: number
): Promise<{ triggered: boolean; severity?: 'Critical' | 'Low' }> {
  try {
    if (unitsAvailable >= 10) {
      return { triggered: false }
    }

    const isCritical = unitsAvailable < 5
    const severity: 'Critical' | 'Low' = isCritical ? 'Critical' : 'Low'
    const dateStr = new Date().toISOString().slice(0, 10)
    const eventKey = `stock:alert:${bloodGroup}:${severity.toLowerCase()}:${dateStr}`

    await notifyAdmins({
      type: 'LowStockAlert',
      title: `${severity} Stock Alert: Blood Group ${bloodGroup}`,
      message: `Blood inventory for ${bloodGroup} is at ${unitsAvailable} unit(s), which is below the ${severity.toLowerCase()} threshold.`,
      priority: isCritical ? 'Emergency' : 'High',
      referenceType: 'BloodStock',
      eventKey,
    })

    return { triggered: true, severity }
  } catch (error: any) {
    console.error('[NotificationService] Non-blocking failure in low stock alert:', {
      bloodGroup,
      unitsAvailable,
      error: error?.message || error,
    })
    return { triggered: false }
  }
}


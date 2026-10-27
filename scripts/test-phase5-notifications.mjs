/**
 * Phase 5 Part A (Steps 1 & 2) Test Suite:
 * Notification Models, Schemas, Indexes, and Service Helper Verification
 */

import mongoose from 'mongoose'
import { NotificationModel, UserModel } from '../lib/schemas.ts'
import {
  sendInAppNotification,
  notifyAdmins,
  retryNotification,
} from '../lib/notifications.ts'
import { getSafeTestDbUri } from './test-db-guard.mjs'

const MONGODB_URI = getSafeTestDbUri()

let passedTests = 0
let failedTests = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`)
    passedTests++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    failedTests++
  }
}

async function runTests() {
  console.log('========================================================')
  console.log('RUNNING PHASE 5 PART A (STEPS 1 & 2) VERIFICATION SUITE')
  console.log('========================================================\n')

  await mongoose.connect(MONGODB_URI)

  console.log('[Suite 1: Schema & Indexes Verification]')

  // Ensure indexes are built
  await NotificationModel.init()
  const indexes = await NotificationModel.collection.indexes()
  const indexNames = indexes.map((idx) => Object.keys(idx.key).join('_'))

  const hasRecipientReadCreatedIndex = indexes.some((idx) => {
    const keys = Object.keys(idx.key)
    return (
      keys.length === 3 &&
      idx.key.recipientId === 1 &&
      idx.key.isRead === 1 &&
      idx.key.createdAt === -1
    )
  })
  assert(
    hasRecipientReadCreatedIndex,
    'Compound query index { recipientId: 1, isRead: 1, createdAt: -1 } exists'
  )

  const hasRecipientEventUniqueIndex = indexes.some((idx) => {
    const keys = Object.keys(idx.key)
    return (
      keys.length === 2 &&
      idx.key.recipientId === 1 &&
      idx.key.eventKey === 1 &&
      idx.unique === true
    )
  })
  assert(
    hasRecipientEventUniqueIndex,
    'Strict idempotency unique index { recipientId: 1, eventKey: 1 } exists and is unique'
  )

  console.log('\n[Suite 2: Notification Creation & Field Persistence]')

  const testRecipientId = new mongoose.Types.ObjectId()
  const testRefId = new mongoose.Types.ObjectId()
  const eventKey = `test:event:${Date.now()}`

  const createResult = await sendInAppNotification({
    recipientId: testRecipientId,
    recipientRole: 'Hospital',
    type: 'RequestApproved',
    title: 'Blood Request Approved',
    message: 'Your emergency blood request has been approved.',
    referenceId: testRefId,
    referenceType: 'BloodRequest',
    priority: 'Emergency',
    eventKey,
  })

  assert(createResult.success === true, 'sendInAppNotification returns success: true')
  assert(createResult.created === true, 'sendInAppNotification returns created: true for first attempt')
  assert(Boolean(createResult.id), 'sendInAppNotification returns generated document id')

  const doc = await NotificationModel.findOne({ recipientId: testRecipientId, eventKey }).lean()
  assert(doc !== null, 'Notification persisted in MongoDB')
  assert(doc?.title === 'Blood Request Approved', 'Persisted title matches input')
  assert(doc?.message === 'Your emergency blood request has been approved.', 'Persisted message matches input')
  assert(doc?.priority === 'Emergency', 'Persisted priority matches input')
  assert(doc?.type === 'RequestApproved', 'Persisted type matches input')
  assert(doc?.isRead === false, 'Default isRead is false')
  assert(doc?.readAt === null, 'Default readAt is null')
  assert(doc?.referenceType === 'BloodRequest', 'Persisted referenceType matches input')

  console.log('\n[Suite 3: Recipient/Event Strict Idempotency]')

  const duplicateResult = await sendInAppNotification({
    recipientId: testRecipientId,
    recipientRole: 'Hospital',
    type: 'RequestApproved',
    title: 'DUPLICATE ATTEMPT',
    message: 'This must be ignored because of eventKey idempotency.',
    referenceId: testRefId,
    referenceType: 'BloodRequest',
    priority: 'Normal',
    eventKey,
  })

  assert(duplicateResult.success === true, 'Duplicate call returns success: true (idempotent no-op)')
  assert(duplicateResult.created === false, 'Duplicate call returns created: false')

  const countAfterDuplicate = await NotificationModel.countDocuments({
    recipientId: testRecipientId,
    eventKey,
  })
  assert(countAfterDuplicate === 1, 'Exactly one notification document exists in database')

  const docAfterDuplicate = await NotificationModel.findOne({
    recipientId: testRecipientId,
    eventKey,
  }).lean()
  assert(
    docAfterDuplicate?.title === 'Blood Request Approved',
    'Original notification title was NOT overwritten by duplicate call'
  )

  console.log('\n[Suite 4: Retry / Recovery Helper]')

  const retryResult = await retryNotification({
    recipientId: testRecipientId,
    recipientRole: 'Hospital',
    type: 'RequestApproved',
    title: 'Blood Request Approved',
    message: 'Your emergency blood request has been approved.',
    referenceId: testRefId,
    referenceType: 'BloodRequest',
    priority: 'Emergency',
    eventKey,
  })
  assert(retryResult.success === true, 'retryNotification returns success: true')
  assert(retryResult.created === false, 'retryNotification does not create duplicate for existing eventKey')

  console.log('\n[Suite 5: Admin Broadcasting via notifyAdmins]')

  const adminEventKey = `test:admin:lowstock:${Date.now()}`
  const adminBroadcastResult = await notifyAdmins({
    type: 'LowStockAlert',
    title: 'Low Stock Alert: O-',
    message: 'O- stock has fallen below threshold of 5 units.',
    priority: 'High',
    eventKey: adminEventKey,
  })

  const adminCount = await UserModel.countDocuments({ role: 'Admin' })
  assert(adminBroadcastResult.success === true, 'notifyAdmins returns success: true')
  assert(
    adminBroadcastResult.totalAttempted === adminCount,
    `notifyAdmins attempted delivery to all ${adminCount} admin accounts`
  )
  assert(
    adminBroadcastResult.totalCreated === adminCount,
    `notifyAdmins created ${adminCount} notifications`
  )

  // Verify admin duplicate idempotency
  const adminDuplicateResult = await notifyAdmins({
    type: 'LowStockAlert',
    title: 'Low Stock Alert: O-',
    message: 'Duplicate admin broadcast attempt.',
    priority: 'High',
    eventKey: adminEventKey,
  })
  assert(adminDuplicateResult.success === true, 'Duplicate notifyAdmins returns success: true')
  assert(
    adminDuplicateResult.totalCreated === 0,
    'Duplicate notifyAdmins creates 0 duplicate notifications'
  )

  console.log('\n[Suite 6: Non-Blocking Error Handling Verification]')

  // Passing an invalid recipientId to ensure it does not throw unhandled exception
  const faultyResult = await sendInAppNotification({
    recipientId: 'INVALID_OBJECT_ID_FORMAT',
    type: 'General',
    title: 'Faulty Test',
    message: 'Should catch gracefully without throwing.',
    eventKey: 'faulty:test',
  })
  assert(faultyResult.success === false, 'Gracefully handles invalid cast without crashing')
  assert(faultyResult.created === false, 'Faulty input does not create record')
  assert(typeof faultyResult.error === 'string', 'Faulty input returns descriptive error message')

  // Clean up all test records
  console.log('\n[Cleanup]')
  const deleted = await NotificationModel.deleteMany({
    $or: [{ recipientId: testRecipientId }, { eventKey: adminEventKey }],
  })
  console.log(`  ✓ Cleaned up ${deleted.deletedCount} test notification records from database.`)

  await mongoose.disconnect()

  console.log('\n========================================================')
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`)
  console.log('========================================================')

  if (failedTests > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err)
  process.exit(1)
})

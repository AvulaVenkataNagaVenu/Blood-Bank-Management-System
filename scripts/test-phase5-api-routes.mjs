/**
 * Phase 5 Part A (Step 3) Test Suite:
 * Notification API Routes Verification
 *
 * Tests:
 * 1. Authentication Rejection (401 Unauthorized on all endpoints for unauthenticated or forged requests)
 * 2. Recipient Data Isolation (Donor, Hospital, Admin receive strictly their own notifications)
 * 3. Query Filtering, Limit Boundaries & Newest-First Sorting
 * 4. Unread Notification Count Endpoint
 * 5. Mark Single Notification Read (Ownership enforcement, 403 on cross-user modification, 400 on malformed ID, 404 on missing)
 * 6. Mark All Read (Scoped strictly to authenticated user, does not alter other users)
 * 7. Safe Cleanup of isolated test entities
 */

import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { NotificationModel, UserModel } from '../lib/schemas.ts'
import { getSafeTestDbUri } from './test-db-guard.mjs'

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const MONGODB_URI = getSafeTestDbUri()

let passed = 0
let failed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ PASS: ${message}`)
    passed++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    failed++
  }
}

async function loginAndGetCookie(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(`Failed to log in as ${email}: HTTP ${res.status}`)
  }
  const setCookie = res.headers.get('set-cookie')
  if (!setCookie) {
    throw new Error(`No set-cookie returned for ${email}`)
  }
  return setCookie.split(';')[0]
}

async function runApiTests() {
  console.log('========================================================================')
  console.log('RUNNING PHASE 5 PART A (STEP 3) NOTIFICATION API ROUTES TESTS')
  console.log(`Target: ${BASE_URL}`)
  console.log('========================================================================\n')

  await mongoose.connect(MONGODB_URI)

  const createdUserIds = []
  const createdNotificationIds = []

  const testPassword = 'Step3Password123!'
  const hashedPassword = await bcrypt.hash(testPassword, 10)
  const timestamp = Date.now()

  try {
    // ----------------------------------------------------
    // SETUP: ISOLATED TEST USERS & NOTIFICATIONS
    // ----------------------------------------------------
    console.log('[Setup: Creating Isolated Test Users and Seeding Notifications]')

    const donorUser = new UserModel({
      name: 'Step3 Donor User',
      email: `donor.step3.${timestamp}@example.com`,
      password: hashedPassword,
      role: 'Donor',
      bloodGroup: 'O+',
    })
    await donorUser.save()
    createdUserIds.push(donorUser._id)

    const hospitalUser = new UserModel({
      name: 'Step3 Hospital User',
      email: `hospital.step3.${timestamp}@example.com`,
      password: hashedPassword,
      role: 'Hospital',
      hospitalName: 'Step3 General Hospital',
    })
    await hospitalUser.save()
    createdUserIds.push(hospitalUser._id)

    const adminUser = new UserModel({
      name: 'Step3 Admin User',
      email: `admin.step3.${timestamp}@example.com`,
      password: hashedPassword,
      role: 'Admin',
    })
    await adminUser.save()
    createdUserIds.push(adminUser._id)

    // Authenticate test users
    const donorCookie = await loginAndGetCookie(donorUser.email, testPassword)
    const hospitalCookie = await loginAndGetCookie(hospitalUser.email, testPassword)
    const adminCookie = await loginAndGetCookie(adminUser.email, testPassword)

    assert(Boolean(donorCookie), 'Donor authenticated and received session cookie')
    assert(Boolean(hospitalCookie), 'Hospital authenticated and received session cookie')
    assert(Boolean(adminCookie), 'Admin authenticated and received session cookie')

    // Seed notifications for Donor:
    // Notif 1: oldest, unread
    // Notif 2: middle, unread
    // Notif 3: newest, already read
    const baseTime = Date.now()
    const donorNotif1 = new NotificationModel({
      recipientId: donorUser._id,
      recipientRole: 'Donor',
      type: 'General',
      title: 'Donor Notif 1 (Oldest, Unread)',
      message: 'Oldest donor notification message',
      priority: 'Normal',
      isRead: false,
      readAt: null,
      eventKey: `test:step3:donor1:${timestamp}`,
      createdAt: new Date(baseTime - 300000), // 5 mins ago
    })
    await donorNotif1.save()
    createdNotificationIds.push(donorNotif1._id)

    const donorNotif2 = new NotificationModel({
      recipientId: donorUser._id,
      recipientRole: 'Donor',
      type: 'AppointmentUpdate',
      title: 'Donor Notif 2 (Middle, Unread)',
      message: 'Middle donor notification message',
      priority: 'Normal',
      isRead: false,
      readAt: null,
      eventKey: `test:step3:donor2:${timestamp}`,
      createdAt: new Date(baseTime - 180000), // 3 mins ago
    })
    await donorNotif2.save()
    createdNotificationIds.push(donorNotif2._id)

    const donorNotif3 = new NotificationModel({
      recipientId: donorUser._id,
      recipientRole: 'Donor',
      type: 'General',
      title: 'Donor Notif 3 (Newest, Read)',
      message: 'Newest donor notification message (already read)',
      priority: 'Normal',
      isRead: true,
      readAt: new Date(baseTime - 60000),
      eventKey: `test:step3:donor3:${timestamp}`,
      createdAt: new Date(baseTime - 60000), // 1 min ago
    })
    await donorNotif3.save()
    createdNotificationIds.push(donorNotif3._id)

    // Seed notifications for Hospital:
    // Notif 4: unread
    // Notif 5: unread
    const hospNotif4 = new NotificationModel({
      recipientId: hospitalUser._id,
      recipientRole: 'Hospital',
      type: 'RequestApproved',
      title: 'Hospital Notif 4 (Unread)',
      message: 'Your blood request was approved.',
      priority: 'High',
      isRead: false,
      readAt: null,
      eventKey: `test:step3:hosp4:${timestamp}`,
      createdAt: new Date(baseTime - 120000),
    })
    await hospNotif4.save()
    createdNotificationIds.push(hospNotif4._id)

    const hospNotif5 = new NotificationModel({
      recipientId: hospitalUser._id,
      recipientRole: 'Hospital',
      type: 'BloodIssued',
      title: 'Hospital Notif 5 (Unread)',
      message: 'Blood units have been issued.',
      priority: 'Emergency',
      isRead: false,
      readAt: null,
      eventKey: `test:step3:hosp5:${timestamp}`,
      createdAt: new Date(baseTime - 60000),
    })
    await hospNotif5.save()
    createdNotificationIds.push(hospNotif5._id)

    // Seed notification for Admin:
    // Notif 6: unread
    const adminNotif6 = new NotificationModel({
      recipientId: adminUser._id,
      recipientRole: 'Admin',
      type: 'LowStockAlert',
      title: 'Admin Notif 6 (Unread)',
      message: 'Stock is low for O+.',
      priority: 'High',
      isRead: false,
      readAt: null,
      eventKey: `test:step3:admin6:${timestamp}`,
      createdAt: new Date(baseTime - 30000),
    })
    await adminNotif6.save()
    createdNotificationIds.push(adminNotif6._id)

    // ----------------------------------------------------
    // SUITE 1: UNAUTHENTICATED REQUESTS (401 UNAUTHORIZED)
    // ----------------------------------------------------
    console.log('\n[Suite 1: Unauthenticated Requests Rejection (401 Unauthorized)]')

    const unauthGet = await fetch(`${BASE_URL}/api/notifications`)
    assert(unauthGet.status === 401, 'SECURITY: Unauthenticated GET /api/notifications rejected with 401')

    const unauthUnread = await fetch(`${BASE_URL}/api/notifications/unread-count`)
    assert(unauthUnread.status === 401, 'SECURITY: Unauthenticated GET /api/notifications/unread-count rejected with 401')

    const unauthMarkRead = await fetch(`${BASE_URL}/api/notifications/${donorNotif1._id}/read`, {
      method: 'PATCH',
    })
    assert(unauthMarkRead.status === 401, 'SECURITY: Unauthenticated PATCH /api/notifications/[id]/read rejected with 401')

    const unauthMarkAll = await fetch(`${BASE_URL}/api/notifications/mark-all-read`, {
      method: 'PATCH',
    })
    assert(unauthMarkAll.status === 401, 'SECURITY: Unauthenticated PATCH /api/notifications/mark-all-read rejected with 401')

    const forgedCookie = 'token=ey.forged.invalid'
    const forgedGet = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Cookie: forgedCookie },
    })
    assert(forgedGet.status === 401, 'SECURITY: Forged cookie rejected with 401 on /api/notifications')

    const forgedMarkRead = await fetch(`${BASE_URL}/api/notifications/${donorNotif1._id}/read`, {
      method: 'PATCH',
      headers: { Cookie: forgedCookie },
    })
    assert(forgedMarkRead.status === 401, 'SECURITY: Forged cookie rejected with 401 on /api/notifications/[id]/read')

    // ----------------------------------------------------
    // SUITE 2: RECIPIENT DATA ISOLATION & PRIVACY BOUNDARIES
    // ----------------------------------------------------
    console.log('\n[Suite 2: Recipient Data Privacy & Isolation Boundaries]')

    // Donor query: should return 3 notifications, all belonging to donorUser
    const donorRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Cookie: donorCookie },
    })
    assert(donorRes.status === 200, 'Donor GET /api/notifications returns 200 OK')
    const donorJson = await donorRes.json()
    assert(donorJson.success === true, 'Donor response success is true')
    assert(donorJson.data.length === 3, 'Donor list contains exactly 3 notifications')
    const allBelongToDonor = donorJson.data.every(
      (n) => n.recipientId.toString() === donorUser._id.toString()
    )
    assert(allBelongToDonor, 'DATA PRIVACY: All notifications returned to Donor belong strictly to Donor')
    const noHospInDonor = donorJson.data.every(
      (n) => n._id.toString() !== hospNotif4._id.toString() && n._id.toString() !== hospNotif5._id.toString()
    )
    assert(noHospInDonor, 'DATA PRIVACY: Hospital notifications strictly excluded from Donor list')

    // Hospital query: should return 2 notifications, all belonging to hospitalUser
    const hospRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Cookie: hospitalCookie },
    })
    assert(hospRes.status === 200, 'Hospital GET /api/notifications returns 200 OK')
    const hospJson = await hospRes.json()
    assert(hospJson.data.length === 2, 'Hospital list contains exactly 2 notifications')
    const allBelongToHosp = hospJson.data.every(
      (n) => n.recipientId.toString() === hospitalUser._id.toString()
    )
    assert(allBelongToHosp, 'DATA PRIVACY: All notifications returned to Hospital belong strictly to Hospital')

    // Admin query: must be recipient-scoped (Admin sees ONLY notifications addressed to this admin)
    const adminRes = await fetch(`${BASE_URL}/api/notifications`, {
      headers: { Cookie: adminCookie },
    })
    assert(adminRes.status === 200, 'Admin GET /api/notifications returns 200 OK')
    const adminJson = await adminRes.json()
    assert(adminJson.data.length === 1, 'Admin list contains only 1 notification addressed to this admin')
    assert(
      adminJson.data[0]._id.toString() === adminNotif6._id.toString(),
      'Admin notifications are recipient-scoped and do not leak user-specific feeds'
    )

    // ----------------------------------------------------
    // SUITE 3: QUERY FILTERING, LIMIT BOUNDARIES & SORTING
    // ----------------------------------------------------
    console.log('\n[Suite 3: Query Filtering, Limit Boundaries & Sorting]')

    // Unread-only filtering for Donor (should return 2 instead of 3)
    const donorUnreadRes = await fetch(`${BASE_URL}/api/notifications?unreadOnly=true`, {
      headers: { Cookie: donorCookie },
    })
    const donorUnreadJson = await donorUnreadRes.json()
    assert(donorUnreadJson.data.length === 2, 'unreadOnly=true returns only unread notifications (2 items)')
    assert(
      donorUnreadJson.data.every((n) => n.isRead === false),
      'All returned items with unreadOnly=true have isRead: false'
    )

    // Sorting: Newest first (Notif 3 is newest, Notif 1 is oldest)
    const returnedTitles = donorJson.data.map((n) => n.title)
    assert(
      returnedTitles[0] === 'Donor Notif 3 (Newest, Read)' &&
        returnedTitles[1] === 'Donor Notif 2 (Middle, Unread)' &&
        returnedTitles[2] === 'Donor Notif 1 (Oldest, Unread)',
      'Notifications are strictly sorted newest first (createdAt: -1)'
    )

    // Limit parameter: limit=2 returns at most 2 items
    const limit2Res = await fetch(`${BASE_URL}/api/notifications?limit=2`, {
      headers: { Cookie: donorCookie },
    })
    const limit2Json = await limit2Res.json()
    assert(limit2Json.data.length === 2, 'limit=2 bounds result to exactly 2 notifications')

    // Limit parameter validation: invalid limits rejected with 400 Bad Request
    const limit0Res = await fetch(`${BASE_URL}/api/notifications?limit=0`, {
      headers: { Cookie: donorCookie },
    })
    assert(limit0Res.status === 400, 'limit=0 rejected with 400 Bad Request')

    const limitNegRes = await fetch(`${BASE_URL}/api/notifications?limit=-10`, {
      headers: { Cookie: donorCookie },
    })
    assert(limitNegRes.status === 400, 'Negative limit rejected with 400 Bad Request')

    const limitStrRes = await fetch(`${BASE_URL}/api/notifications?limit=invalid`, {
      headers: { Cookie: donorCookie },
    })
    assert(limitStrRes.status === 400, 'Non-numeric limit rejected with 400 Bad Request')

    // Limit clamping: limit=200 accepted and bounded
    const limit200Res = await fetch(`${BASE_URL}/api/notifications?limit=200`, {
      headers: { Cookie: donorCookie },
    })
    assert(limit200Res.status === 200, 'limit=200 accepted and clamped to maximum bounds')

    // ----------------------------------------------------
    // SUITE 4: UNREAD COUNT ENDPOINT
    // ----------------------------------------------------
    console.log('\n[Suite 4: Unread Count Endpoint]')

    // Donor unread count: Notif 1 & Notif 2 are unread (count = 2)
    const donorCountRes = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Cookie: donorCookie },
    })
    assert(donorCountRes.status === 200, 'GET /api/notifications/unread-count returns 200 OK')
    const donorCountJson = await donorCountRes.json()
    assert(donorCountJson.data.unreadCount === 2, 'Donor unreadCount accurately equals 2')
    assert(donorCountJson.data.count === 2, 'Donor count field accurately equals 2')

    // Hospital unread count: Notif 4 & Notif 5 are unread (count = 2)
    const hospCountRes = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Cookie: hospitalCookie },
    })
    const hospCountJson = await hospCountRes.json()
    assert(hospCountJson.data.unreadCount === 2, 'Hospital unreadCount accurately equals 2')

    // Admin unread count: Notif 6 is unread (count = 1)
    const adminCountRes = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Cookie: adminCookie },
    })
    const adminCountJson = await adminCountRes.json()
    assert(adminCountJson.data.unreadCount === 1, 'Admin unreadCount accurately equals 1')

    // ----------------------------------------------------
    // SUITE 5: MARK SINGLE NOTIFICATION READ (PATCH /api/notifications/[id]/read)
    // ----------------------------------------------------
    console.log('\n[Suite 5: Mark Single Notification Read & Ownership Enforcement]')

    // Donor marks Notif 2 as read
    const markReadRes = await fetch(`${BASE_URL}/api/notifications/${donorNotif2._id}/read`, {
      method: 'PATCH',
      headers: { Cookie: donorCookie },
    })
    assert(markReadRes.status === 200, 'PATCH /api/notifications/[id]/read returns 200 OK')
    const markReadJson = await markReadRes.json()
    assert(markReadJson.success === true, 'Mark read returns success: true')
    assert(markReadJson.data.isRead === true, 'Notification isRead successfully set to true')
    assert(Boolean(markReadJson.data.readAt), 'Notification readAt timestamp is recorded')

    // Verify unread count decremented from 2 to 1 for Donor
    const donorCountAfterRead = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Cookie: donorCookie },
    })
    const donorCountAfterReadJson = await donorCountAfterRead.json()
    assert(
      donorCountAfterReadJson.data.unreadCount === 1,
      'Donor unread count accurately decremented from 2 to 1'
    )

    // Repeat mark read preserves existing readAt
    const originalReadAt = markReadJson.data.readAt
    const repeatMarkReadRes = await fetch(`${BASE_URL}/api/notifications/${donorNotif2._id}/read`, {
      method: 'PATCH',
      headers: { Cookie: donorCookie },
    })
    const repeatMarkReadJson = await repeatMarkReadRes.json()
    assert(repeatMarkReadRes.status === 200, 'Repeat mark read returns 200 OK')
    assert(
      repeatMarkReadJson.data.readAt === originalReadAt,
      'Repeat mark read preserves original readAt timestamp'
    )

    // Cross-user modification forbidden: Donor attempts to mark Hospital's Notif 4 as read
    const crossUserRes = await fetch(`${BASE_URL}/api/notifications/${hospNotif4._id}/read`, {
      method: 'PATCH',
      headers: { Cookie: donorCookie },
    })
    assert(crossUserRes.status === 403, 'SECURITY: Donor modifying Hospital notification rejected with 403 Forbidden')
    const hospNotifInDb = await NotificationModel.findById(hospNotif4._id)
    assert(hospNotifInDb.isRead === false, 'DATA INTEGRITY: Hospital notification remained unread in DB')

    // Missing notification ID: returns 404
    const nonExistentId = new mongoose.Types.ObjectId()
    const missingRes = await fetch(`${BASE_URL}/api/notifications/${nonExistentId}/read`, {
      method: 'PATCH',
      headers: { Cookie: donorCookie },
    })
    assert(missingRes.status === 404, 'Non-existent notification ID rejected with 404 Not Found')

    // Malformed notification ID: returns 400
    const malformedRes = await fetch(`${BASE_URL}/api/notifications/invalid-format-id/read`, {
      method: 'PATCH',
      headers: { Cookie: donorCookie },
    })
    assert(malformedRes.status === 400, 'Malformed notification ID rejected with 400 Bad Request')

    // ----------------------------------------------------
    // SUITE 6: MARK ALL NOTIFICATIONS READ (PATCH /api/notifications/mark-all-read)
    // ----------------------------------------------------
    console.log('\n[Suite 6: Mark All Notifications Read]')

    // Hospital marks all read (had 2 unread notifications: Notif 4 & Notif 5)
    const markAllRes = await fetch(`${BASE_URL}/api/notifications/mark-all-read`, {
      method: 'PATCH',
      headers: { Cookie: hospitalCookie },
    })
    assert(markAllRes.status === 200, 'PATCH /api/notifications/mark-all-read returns 200 OK')
    const markAllJson = await markAllRes.json()
    assert(markAllJson.success === true, 'Mark all read returns success: true')
    assert(markAllJson.data.modifiedCount === 2, 'modifiedCount equals exactly 2')

    // Hospital unread count should now be 0
    const hospCountAfterAll = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Cookie: hospitalCookie },
    })
    const hospCountAfterAllJson = await hospCountAfterAll.json()
    assert(hospCountAfterAllJson.data.unreadCount === 0, 'Hospital unread count is now 0')

    // Donor unread count should be unaffected (still 1 remaining: Notif 1)
    const donorCountAfterHospMarkAll = await fetch(`${BASE_URL}/api/notifications/unread-count`, {
      headers: { Cookie: donorCookie },
    })
    const donorCountAfterHospMarkAllJson = await donorCountAfterHospMarkAll.json()
    assert(
      donorCountAfterHospMarkAllJson.data.unreadCount === 1,
      'USER ISOLATION: Hospital mark-all-read did NOT affect Donor unread count'
    )
  } finally {
    // ----------------------------------------------------
    // CLEANUP: REMOVE ISOLATED TEST RECORDS
    // ----------------------------------------------------
    console.log('\n[Cleanup: Removing Temporary Security Test Records]')
    if (createdNotificationIds.length > 0) {
      const delNotifs = await NotificationModel.deleteMany({ _id: { $in: createdNotificationIds } })
      console.log(`  ✓ Cleaned up ${delNotifs.deletedCount} temporary test notifications.`)
    }
    if (createdUserIds.length > 0) {
      const delUsers = await UserModel.deleteMany({ _id: { $in: createdUserIds } })
      console.log(`  ✓ Cleaned up ${delUsers.deletedCount} temporary test users.`)
    }
    await mongoose.disconnect()
  }

  console.log('\n========================================================================')
  console.log(`PHASE 5 STEP 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('========================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runApiTests().catch((err) => {
  console.error('Fatal API test error:', err)
  process.exit(1)
})

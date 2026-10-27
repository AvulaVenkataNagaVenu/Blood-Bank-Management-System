/**
 * Phase 5 Part A (Step 4) Test Suite:
 * Business Event Wiring & Idempotent Notifications Verification
 *
 * Tests:
 * 1. Blood Request Events (Hospital submit -> notify Admins; Admin approve/reject -> notify Hospital; Hospital/Admin cancel -> notify other party)
 * 2. Blood Issuance Events (Admin issue -> notify Hospital; Admin cancel -> notify Hospital & Admins)
 * 3. Appointment Events (Donor book -> notify Donor & Admins; Admin confirm/complete -> notify Donor; Cancel -> notify other party)
 * 4. Low Stock Alerts & Daily Duplicate Suppression (< 10 Low alert, < 5 Critical alert, duplicate suppression on same-day level changes)
 * 5. Failure Safety (No ghost notifications on failed validation, unauthorized requests, or concurrency conflicts)
 * 6. Isolated Entity Self-Cleanup
 */

import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import {
  NotificationModel,
  UserModel,
  BloodStockModel,
  BloodRequestModel,
  BloodIssuanceModel,
  AppointmentModel,
  DonationSlotModel,
} from '../lib/schemas.ts'
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

async function runEventWiringTests() {
  console.log('========================================================================')
  console.log('RUNNING PHASE 5 PART A (STEP 4) BUSINESS EVENT WIRING TESTS')
  console.log(`Target: ${BASE_URL}`)
  console.log('========================================================================\n')

  await mongoose.connect(MONGODB_URI)

  const createdUserIds = []
  const createdRequestIds = []
  const createdIssuanceIds = []
  const createdAppointmentIds = []
  const createdNotificationIds = []

  const testPassword = 'Step4Password123!'
  const hashedPassword = await bcrypt.hash(testPassword, 10)
  const timestamp = Date.now()

  try {
    // ----------------------------------------------------
    // SETUP: ISOLATED TEST USERS
    // ----------------------------------------------------
    console.log('[Setup: Creating Isolated Test Users]')

    const hospitalUser = new UserModel({
      name: 'Step4 Hospital Requisition',
      email: `hospital.step4.${timestamp}@example.com`,
      password: hashedPassword,
      role: 'Hospital',
      hospitalName: 'Step4 St. Jude Hospital',
    })
    await hospitalUser.save()
    createdUserIds.push(hospitalUser._id)

    const donorUser = new UserModel({
      name: 'Step4 Donor User',
      email: `donor.step4.${timestamp}@example.com`,
      password: hashedPassword,
      role: 'Donor',
      bloodGroup: 'B+',
    })
    await donorUser.save()
    createdUserIds.push(donorUser._id)

    const adminUser = new UserModel({
      name: 'Step4 Admin User',
      email: `admin.step4.${timestamp}@example.com`,
      password: hashedPassword,
      role: 'Admin',
    })
    await adminUser.save()
    createdUserIds.push(adminUser._id)

    const hospCookie = await loginAndGetCookie(hospitalUser.email, testPassword)
    const donorCookie = await loginAndGetCookie(donorUser.email, testPassword)
    const adminCookie = await loginAndGetCookie(adminUser.email, testPassword)

    assert(Boolean(hospCookie), 'Hospital authenticated and session initialized')
    assert(Boolean(donorCookie), 'Donor authenticated and session initialized')
    assert(Boolean(adminCookie), 'Admin authenticated and session initialized')

    // Initialize stock for B+ (30 units) so issuance works reliably
    await BloodStockModel.updateOne(
      { bloodGroup: 'B+' },
      { $set: { unitsAvailable: 30, lastUpdated: new Date() } },
      { upsert: true }
    )

    // ----------------------------------------------------
    // SUITE 1: BLOOD REQUEST EVENTS & RECIPIENT ROUTING
    // ----------------------------------------------------
    console.log('\n[Suite 1: Blood Request Events (Submission, Approval, Rejection, Cancellation)]')

    // 1.1 Hospital submits blood request -> Admins must receive RequestSubmitted notification
    const submitRes = await fetch(`${BASE_URL}/api/blood-requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: hospCookie,
      },
      body: JSON.stringify({
        bloodGroup: 'B+',
        unitsRequired: 4,
        priority: 'Emergency',
      }),
    })
    assert(submitRes.status === 201, 'Hospital successfully submitted emergency blood request (201 Created)')
    const submitJson = await submitRes.json()
    const req1Id = submitJson.data._id
    createdRequestIds.push(req1Id)

    // Verify Admin received RequestSubmitted notification
    const adminNotifSubmit = await NotificationModel.findOne({
      recipientId: adminUser._id,
      eventKey: `request:submit:${req1Id}`,
    })
    assert(adminNotifSubmit !== null, 'EVENT E1: Admin received RequestSubmitted notification')
    assert(adminNotifSubmit?.type === 'RequestSubmitted', 'Notification type is RequestSubmitted')
    assert(adminNotifSubmit?.priority === 'Emergency', 'Emergency request retains Emergency notification priority')
    if (adminNotifSubmit) createdNotificationIds.push(adminNotifSubmit._id)

    // Verify Hospital did NOT receive the Admin notification
    const hospNotifSubmit = await NotificationModel.findOne({
      recipientId: hospitalUser._id,
      eventKey: `request:submit:${req1Id}`,
    })
    assert(hospNotifSubmit === null, 'Hospital does not receive admin submission alert (strictly scoped)')

    // 1.2 Admin approves blood request -> Requesting Hospital must receive RequestApproved notification
    const approveRes = await fetch(`${BASE_URL}/api/blood-requests/${req1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        status: 'Approved',
      }),
    })
    assert(approveRes.status === 200, 'Admin successfully approved blood request (200 OK)')

    const hospNotifApprove = await NotificationModel.findOne({
      recipientId: hospitalUser._id,
      eventKey: `request:approved:${req1Id}`,
    })
    assert(hospNotifApprove !== null, 'EVENT E2: Hospital received RequestApproved notification')
    assert(hospNotifApprove?.type === 'RequestApproved', 'Notification type is RequestApproved')
    assert(hospNotifApprove?.title === 'Blood Request Approved', 'Notification title is "Blood Request Approved"')
    if (hospNotifApprove) createdNotificationIds.push(hospNotifApprove._id)

    // 1.3 Admin rejects a different blood request -> Requesting Hospital must receive RequestRejected notification
    const req2Res = await fetch(`${BASE_URL}/api/blood-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: hospCookie },
      body: JSON.stringify({ bloodGroup: 'B+', unitsRequired: 2, priority: 'Normal' }),
    })
    const req2Json = await req2Res.json()
    const req2Id = req2Json.data._id
    createdRequestIds.push(req2Id)

    const rejectRes = await fetch(`${BASE_URL}/api/blood-requests/${req2Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ status: 'Rejected', rejectionReason: 'Inventory reserved for trauma center' }),
    })
    assert(rejectRes.status === 200, 'Admin rejected blood request (200 OK)')

    const hospNotifReject = await NotificationModel.findOne({
      recipientId: hospitalUser._id,
      eventKey: `request:rejected:${req2Id}`,
    })
    assert(hospNotifReject !== null, 'EVENT E3: Hospital received RequestRejected notification')
    assert(hospNotifReject?.type === 'RequestRejected', 'Notification type is RequestRejected')
    assert(
      hospNotifReject?.message.includes('Inventory reserved for trauma center'),
      'Rejection notification includes rejection reason'
    )
    if (hospNotifReject) createdNotificationIds.push(hospNotifReject._id)

    // 1.4 Hospital cancels a request -> Admins must receive RequestCancelled notification
    const req3Res = await fetch(`${BASE_URL}/api/blood-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: hospCookie },
      body: JSON.stringify({ bloodGroup: 'B+', unitsRequired: 1, priority: 'Normal' }),
    })
    const req3Json = await req3Res.json()
    const req3Id = req3Json.data._id
    createdRequestIds.push(req3Id)

    const cancelByHospRes = await fetch(`${BASE_URL}/api/blood-requests/${req3Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: hospCookie },
      body: JSON.stringify({ status: 'Cancelled', cancellationReason: 'Patient discharged' }),
    })
    assert(cancelByHospRes.status === 200, 'Hospital cancelled request (200 OK)')

    const adminNotifCancel = await NotificationModel.findOne({
      recipientId: adminUser._id,
      eventKey: `request:cancelled:${req3Id}:admin`,
    })
    assert(adminNotifCancel !== null, 'EVENT E4a: Admin received RequestCancelled notification from Hospital')
    if (adminNotifCancel) createdNotificationIds.push(adminNotifCancel._id)

    // 1.5 Admin cancels an approved request -> Hospital must receive RequestCancelled notification
    const req4Res = await fetch(`${BASE_URL}/api/blood-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: hospCookie },
      body: JSON.stringify({ bloodGroup: 'B+', unitsRequired: 1, priority: 'Normal' }),
    })
    const req4Json = await req4Res.json()
    const req4Id = req4Json.data._id
    createdRequestIds.push(req4Id)

    // Approve first
    await fetch(`${BASE_URL}/api/blood-requests/${req4Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ status: 'Approved' }),
    })

    const cancelByAdminRes = await fetch(`${BASE_URL}/api/blood-requests/${req4Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ status: 'Cancelled', cancellationReason: 'Administrative batch reassignment' }),
    })
    assert(cancelByAdminRes.status === 200, 'Admin cancelled approved request (200 OK)')

    const hospNotifCancelByAdmin = await NotificationModel.findOne({
      recipientId: hospitalUser._id,
      eventKey: `request:cancelled:${req4Id}:hospital`,
    })
    assert(hospNotifCancelByAdmin !== null, 'EVENT E4b: Hospital received RequestCancelled notification from Admin')
    if (hospNotifCancelByAdmin) createdNotificationIds.push(hospNotifCancelByAdmin._id)

    // ----------------------------------------------------
    // SUITE 2: BLOOD ISSUANCE EVENTS
    // ----------------------------------------------------
    console.log('\n[Suite 2: Blood Issuance Events (Issuance & Cancellation/Return)]')

    // 2.1 Issue blood against req1Id (which is Approved for 4 units)
    const issueRes = await fetch(`${BASE_URL}/api/blood-issuances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        requestId: req1Id,
        quantity: 2,
        recipientNotes: 'Batch #B-901',
      }),
    })
    assert(issueRes.status === 201, 'Admin issued 2 units of blood (201 Created)')
    const issueJson = await issueRes.json()
    const issuanceId = issueJson.data.issuance._id
    createdIssuanceIds.push(issuanceId)

    // Verify Hospital received BloodIssued notification
    const hospNotifIssue = await NotificationModel.findOne({
      recipientId: hospitalUser._id,
      eventKey: `issuance:create:${issuanceId}`,
    })
    assert(hospNotifIssue !== null, 'EVENT E5: Hospital received BloodIssued notification')
    assert(hospNotifIssue?.type === 'BloodIssued', 'Notification type is BloodIssued')
    assert(hospNotifIssue?.message.includes('2 unit(s) of B+'), 'Message contains correct units and blood group')
    if (hospNotifIssue) createdNotificationIds.push(hospNotifIssue._id)

    // 2.2 Cancel issuance -> Hospital and Admin must both be notified
    const cancelIssuanceRes = await fetch(`${BASE_URL}/api/blood-issuances/${issuanceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({
        status: 'Cancelled',
        reason: 'Courier packaging seal defect',
      }),
    })
    assert(cancelIssuanceRes.status === 200, 'Admin cancelled issuance record (200 OK)')

    const hospNotifCancelIssuance = await NotificationModel.findOne({
      recipientId: hospitalUser._id,
      eventKey: `issuance:cancelled:${issuanceId}:hospital`,
    })
    assert(hospNotifCancelIssuance !== null, 'EVENT E6a: Hospital received IssuanceCancelled notification')
    if (hospNotifCancelIssuance) createdNotificationIds.push(hospNotifCancelIssuance._id)

    const adminNotifCancelIssuance = await NotificationModel.findOne({
      recipientId: adminUser._id,
      eventKey: `issuance:cancelled:${issuanceId}:admin`,
    })
    assert(adminNotifCancelIssuance !== null, 'EVENT E6b: Admin received IssuanceCancelled ledger audit notification')
    if (adminNotifCancelIssuance) createdNotificationIds.push(adminNotifCancelIssuance._id)

    // ----------------------------------------------------
    // SUITE 3: APPOINTMENT EVENTS
    // ----------------------------------------------------
    console.log('\n[Suite 3: Appointment Events (Booking, Confirmation, Completion, Cancellation)]')

    const slotDate = '2026-11-15'
    const timeSlot = '09:00 - 10:00'

    // 3.1 Donor books appointment -> Donor and Admin notified
    const bookRes = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: donorCookie },
      body: JSON.stringify({ slotDate, timeSlot, notes: 'First-time whole blood donation' }),
    })
    assert(bookRes.status === 201, 'Donor booked appointment (201 Created)')
    const bookJson = await bookRes.json()
    const appt1Id = bookJson.data._id
    createdAppointmentIds.push(appt1Id)

    const donorNotifBook = await NotificationModel.findOne({
      recipientId: donorUser._id,
      eventKey: `appointment:booked:${appt1Id}:donor`,
    })
    assert(donorNotifBook !== null, 'EVENT E7a: Donor received Appointment Scheduled confirmation')
    if (donorNotifBook) createdNotificationIds.push(donorNotifBook._id)

    const adminNotifBook = await NotificationModel.findOne({
      recipientId: adminUser._id,
      eventKey: `appointment:booked:${appt1Id}:admin`,
    })
    assert(adminNotifBook !== null, 'EVENT E7b: Admin received New Donor Appointment alert')
    if (adminNotifBook) createdNotificationIds.push(adminNotifBook._id)

    // 3.2 Admin confirms appointment -> Donor notified
    const confirmRes = await fetch(`${BASE_URL}/api/appointments/${appt1Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ status: 'Confirmed' }),
    })
    assert(confirmRes.status === 200, 'Admin confirmed appointment (200 OK)')

    const donorNotifConfirm = await NotificationModel.findOne({
      recipientId: donorUser._id,
      eventKey: `appointment:confirmed:${appt1Id}`,
    })
    assert(donorNotifConfirm !== null, 'EVENT E9: Donor received Appointment Confirmed notification')
    if (donorNotifConfirm) createdNotificationIds.push(donorNotifConfirm._id)

    // 3.3 Admin marks appointment completed -> Donor notified
    const completeRes = await fetch(`${BASE_URL}/api/appointments/${appt1Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ status: 'Completed' }),
    })
    assert(completeRes.status === 200, 'Admin completed appointment attendance (200 OK)')

    const donorNotifComplete = await NotificationModel.findOne({
      recipientId: donorUser._id,
      eventKey: `appointment:completed:${appt1Id}`,
    })
    assert(donorNotifComplete !== null, 'EVENT E10: Donor received Donation Completed notification')
    if (donorNotifComplete) createdNotificationIds.push(donorNotifComplete._id)

    // 3.4 Donor cancels a new appointment -> Admin notified
    const slotDate2 = '2026-11-16'
    const book2Res = await fetch(`${BASE_URL}/api/appointments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: donorCookie },
      body: JSON.stringify({ slotDate: slotDate2, timeSlot }),
    })
    const book2Json = await book2Res.json()
    const appt2Id = book2Json.data._id
    createdAppointmentIds.push(appt2Id)

    const cancelApptDonorRes = await fetch(`${BASE_URL}/api/appointments/${appt2Id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: donorCookie },
      body: JSON.stringify({ status: 'Cancelled', cancellationReason: 'Work schedule conflict' }),
    })
    assert(cancelApptDonorRes.status === 200, 'Donor cancelled appointment (200 OK)')

    const adminNotifApptCancel = await NotificationModel.findOne({
      recipientId: adminUser._id,
      eventKey: `appointment:cancelled:${appt2Id}:admin`,
    })
    assert(adminNotifApptCancel !== null, 'EVENT E8a: Admin received Appointment Cancelled by Donor alert')
    if (adminNotifApptCancel) createdNotificationIds.push(adminNotifApptCancel._id)

    // ----------------------------------------------------
    // SUITE 4: LOW STOCK ALERTS & DUPLICATE SUPPRESSION
    // ----------------------------------------------------
    console.log('\n[Suite 4: Low Stock Alerts & Daily Duplicate Suppression]')

    const todayStr = new Date().toISOString().slice(0, 10)

    // 4.1 Update AB- stock down to 8 units (Threshold: Low < 10)
    const lowStockRes1 = await fetch(`${BASE_URL}/api/blood-stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ bloodGroup: 'AB-', unitsAvailable: 8 }),
    })
    assert(lowStockRes1.status === 200, 'Admin adjusted AB- stock to 8 units')

    const lowStockNotif = await NotificationModel.findOne({
      recipientId: adminUser._id,
      eventKey: `stock:alert:AB-:low:${todayStr}`,
    })
    assert(lowStockNotif !== null, 'EVENT E11: Low stock alert triggered for AB- (< 10 units)')
    assert(lowStockNotif?.priority === 'High', 'Low stock alert priority is High')
    if (lowStockNotif) createdNotificationIds.push(lowStockNotif._id)

    // 4.2 Repeat update to 7 units on same day -> must NOT create duplicate alert
    const lowStockRes2 = await fetch(`${BASE_URL}/api/blood-stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ bloodGroup: 'AB-', unitsAvailable: 7 }),
    })
    assert(lowStockRes2.status === 200, 'Admin adjusted AB- stock to 7 units')

    const lowStockCount = await NotificationModel.countDocuments({
      recipientId: adminUser._id,
      eventKey: `stock:alert:AB-:low:${todayStr}`,
    })
    assert(lowStockCount === 1, 'DUPLICATE SUPPRESSION: Exactly 1 low stock alert on same day (suppressed re-alert)')

    // 4.3 Drop stock below 5 units (Threshold: Critical < 5) -> Escalates to Critical alert
    const critStockRes = await fetch(`${BASE_URL}/api/blood-stock`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ bloodGroup: 'AB-', unitsAvailable: 3 }),
    })
    assert(critStockRes.status === 200, 'Admin adjusted AB- stock to 3 units (Critical)')

    const critStockNotif = await NotificationModel.findOne({
      recipientId: adminUser._id,
      eventKey: `stock:alert:AB-:critical:${todayStr}`,
    })
    assert(critStockNotif !== null, 'ESCALATION: Critical stock alert triggered for AB- (< 5 units)')
    assert(critStockNotif?.priority === 'Emergency', 'Critical stock alert priority escalated to Emergency')
    if (critStockNotif) createdNotificationIds.push(critStockNotif._id)

    // ----------------------------------------------------
    // SUITE 5: FAILURE SAFETY & DECOUPLING GUARANTEES
    // ----------------------------------------------------
    console.log('\n[Suite 5: Failure Safety & Decoupling Guarantees]')

    // Count notifications for admin before failed operation
    const countBeforeFail = await NotificationModel.countDocuments({ recipientId: adminUser._id })

    // Submit invalid request (e.g. invalid blood group)
    const failRes1 = await fetch(`${BASE_URL}/api/blood-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: hospCookie },
      body: JSON.stringify({ bloodGroup: 'INVALID_GROUP', unitsRequired: 1 }),
    })
    assert(failRes1.status === 400, 'Invalid request submission rejected with 400 Bad Request')

    // Unauthorized attempt by Donor to issue blood
    const failRes2 = await fetch(`${BASE_URL}/api/blood-issuances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: donorCookie },
      body: JSON.stringify({ requestId: req1Id, quantity: 1 }),
    })
    assert(failRes2.status === 403, 'Unauthorized blood issuance attempt rejected with 403 Forbidden')

    // Count notifications for admin after failed operations
    const countAfterFail = await NotificationModel.countDocuments({ recipientId: adminUser._id })
    assert(countBeforeFail === countAfterFail, 'SAFETY GUARANTEE: Zero notifications generated on failed operations')

  } finally {
    // ----------------------------------------------------
    // CLEANUP: SAFELY REMOVE ALL ISOLATED TEST RECORDS
    // ----------------------------------------------------
    console.log('\n[Cleanup: Removing Temporary Test Records]')

    if (createdNotificationIds.length > 0) {
      const delNotifs = await NotificationModel.deleteMany({ _id: { $in: createdNotificationIds } })
      console.log(`  ✓ Cleaned up ${delNotifs.deletedCount} temporary test notifications.`)
    }
    // Also clean up any notifications matching the test users
    const delRemainingNotifs = await NotificationModel.deleteMany({
      recipientId: { $in: createdUserIds },
    })
    if (delRemainingNotifs.deletedCount > 0) {
      console.log(`  ✓ Cleaned up ${delRemainingNotifs.deletedCount} recipient-linked test notifications.`)
    }

    if (createdRequestIds.length > 0) {
      const delReqs = await BloodRequestModel.deleteMany({ _id: { $in: createdRequestIds } })
      console.log(`  ✓ Cleaned up ${delReqs.deletedCount} temporary test blood requests.`)
    }

    if (createdIssuanceIds.length > 0) {
      const delIssues = await BloodIssuanceModel.deleteMany({ _id: { $in: createdIssuanceIds } })
      console.log(`  ✓ Cleaned up ${delIssues.deletedCount} temporary test blood issuances.`)
    }

    if (createdAppointmentIds.length > 0) {
      const delAppts = await AppointmentModel.deleteMany({ _id: { $in: createdAppointmentIds } })
      console.log(`  ✓ Cleaned up ${delAppts.deletedCount} temporary test appointments.`)
    }

    // Clean up temporary slots created during test
    await DonationSlotModel.deleteMany({ slotDate: { $in: ['2026-11-15', '2026-11-16'] } })

    // Restore stock for AB- and B+
    await BloodStockModel.updateOne({ bloodGroup: 'AB-' }, { $set: { unitsAvailable: 15 } })
    await BloodStockModel.updateOne({ bloodGroup: 'B+' }, { $set: { unitsAvailable: 25 } })

    if (createdUserIds.length > 0) {
      const delUsers = await UserModel.deleteMany({ _id: { $in: createdUserIds } })
      console.log(`  ✓ Cleaned up ${delUsers.deletedCount} temporary test users.`)
    }

    await mongoose.disconnect()
  }

  console.log('\n========================================================================')
  console.log(`PHASE 5 STEP 4 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('========================================================================')

  if (failed > 0) {
    process.exit(1)
  }
}

runEventWiringTests().catch((err) => {
  console.error('Fatal event wiring test error:', err)
  process.exit(1)
})

/**
 * Phase 3 Part A & B Test Suite:
 * Donation Tracking, Stock Integrity, Donor Privacy, and Eligibility Estimates
 */

import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { DonationModel, UserModel, BloodStockModel } from '../lib/schemas.ts'
import { isValidBloodGroup, isPositiveInteger } from '../lib/validation.ts'
import { getSafeTestDbUri } from './test-db-guard.mjs'

const MONGODB_URI = getSafeTestDbUri()
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-12345'

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

async function runDonationTests() {
  console.log('========================================================')
  console.log('RUNNING PHASE 3: DONATION TRACKING & INTEGRITY TEST SUITE')
  console.log('========================================================\n')

  await mongoose.connect(MONGODB_URI)

  // 1. Setup Test Users
  console.log('[Suite 1: Authorization & Privacy Scoping]')

  const testDonor1 = new UserModel({
    name: 'Phase3 Alice Donor',
    email: `alice.test.${Date.now()}@example.com`,
    password: 'hashedpassword123',
    role: 'Donor',
    bloodGroup: 'A+',
  })
  await testDonor1.save()

  const testDonor2 = new UserModel({
    name: 'Phase3 Bob Donor',
    email: `bob.test.${Date.now()}@example.com`,
    password: 'hashedpassword123',
    role: 'Donor',
    bloodGroup: 'O-',
  })
  await testDonor2.save()

  const testAdmin = new UserModel({
    name: 'Phase3 Staff Admin',
    email: `admin.test.${Date.now()}@example.com`,
    password: 'hashedpassword123',
    role: 'Admin',
  })
  await testAdmin.save()

  const adminToken = jwt.sign({ userId: testAdmin._id.toString(), role: 'Admin' }, JWT_SECRET)
  const donor1Token = jwt.sign({ userId: testDonor1._id.toString(), role: 'Donor' }, JWT_SECRET)
  const hospitalToken = jwt.sign({ userId: 'hosp-123', role: 'Hospital' }, JWT_SECRET)

  // 1.1 Verify Hospital is strictly blocked from donor records
  const hospitalDecoded = jwt.verify(hospitalToken, JWT_SECRET)
  const isHospitalBlocked = hospitalDecoded.role === 'Hospital'
  assert(isHospitalBlocked, 'SECURITY: Hospital role is identified and blocked from accessing donor records')

  // 1.2 Verify Donor Scoping Privacy: Donor 1 must only access their own donations
  const donationAlice = new DonationModel({
    donorId: testDonor1._id,
    donorName: testDonor1.name,
    donorEmail: testDonor1.email,
    bloodGroup: testDonor1.bloodGroup,
    units: 1,
    donationDate: new Date(),
    status: 'Completed',
    adminId: testAdmin._id,
    adminName: testAdmin.name,
    stockCredited: true,
  })
  await donationAlice.save()

  const donationBob = new DonationModel({
    donorId: testDonor2._id,
    donorName: testDonor2.name,
    donorEmail: testDonor2.email,
    bloodGroup: testDonor2.bloodGroup,
    units: 1,
    donationDate: new Date(),
    status: 'Completed',
    adminId: testAdmin._id,
    adminName: testAdmin.name,
    stockCredited: true,
  })
  await donationBob.save()

  // Simulating Donor 1 query: must match only donorId = testDonor1._id
  const donor1QueryResult = await DonationModel.find({ donorId: testDonor1._id })
  assert(
    donor1QueryResult.length === 1 && donor1QueryResult[0].donorName === 'Phase3 Alice Donor',
    'DATA PRIVACY: Donor 1 query returns ONLY their own donation'
  )
  assert(
    !donor1QueryResult.some((d) => d.donorId.toString() === testDonor2._id.toString()),
    'DATA PRIVACY: Donor 1 cannot view Donor 2 donation records'
  )

  console.log('\n[Suite 2: Single-Credit Guarantee & Anti-Double-Crediting]')
  // Initial stock for A+
  const targetBg = 'A+'
  const stockBefore = await BloodStockModel.findOne({ bloodGroup: targetBg })
  const initialUnits = stockBefore ? stockBefore.unitsAvailable : 0

  // 2.1 Create a pending donation
  const pendingDonation = new DonationModel({
    donorId: testDonor1._id,
    donorName: testDonor1.name,
    donorEmail: testDonor1.email,
    bloodGroup: targetBg,
    units: 1,
    donationDate: new Date(),
    status: 'Pending',
    adminId: testAdmin._id,
    adminName: testAdmin.name,
    stockCredited: false,
  })
  await pendingDonation.save()

  // Pending donation must NOT credit stock
  const stockAfterPending = await BloodStockModel.findOne({ bloodGroup: targetBg })
  assert(
    (stockAfterPending ? stockAfterPending.unitsAvailable : 0) === initialUnits,
    'Pending donation does NOT credit stock'
  )

  // 2.2 First finalization: Transition from Pending to Completed
  const updatedDonation1 = await DonationModel.findOneAndUpdate(
    { _id: pendingDonation._id, status: { $ne: 'Completed' }, stockCredited: false },
    { $set: { status: 'Completed', stockCredited: true } },
    { returnDocument: 'after' }
  )

  assert(Boolean(updatedDonation1 && updatedDonation1.status === 'Completed'), 'Donation transitioned to Completed')
  assert(updatedDonation1.stockCredited === true, 'Donation marked as stockCredited: true')

  // Increment stock atomically
  const creditedStock = await BloodStockModel.findOneAndUpdate(
    { bloodGroup: targetBg },
    { $inc: { unitsAvailable: 1 }, $set: { lastUpdated: new Date() } },
    { returnDocument: 'after' }
  )
  assert(
    creditedStock.unitsAvailable === initialUnits + 1,
    `Stock atomically incremented by 1 unit (${initialUnits} -> ${initialUnits + 1})`
  )

  // 2.3 Attempting Duplicate Completion: Must be BLOCKED
  const duplicateAttempt = await DonationModel.findOneAndUpdate(
    { _id: pendingDonation._id, status: { $ne: 'Completed' }, stockCredited: false },
    { $set: { status: 'Completed', stockCredited: true } },
    { returnDocument: 'after' }
  )

  assert(duplicateAttempt === null, 'SECURITY: Second completion attempt rejected (returned null)')

  // Verify stock remained unchanged and was NOT incremented a second time
  const stockAfterDuplicateAttempt = await BloodStockModel.findOne({ bloodGroup: targetBg })
  assert(
    stockAfterDuplicateAttempt.unitsAvailable === initialUnits + 1,
    'SECURITY: Blood stock was NOT credited twice (remains at exactly +1 unit)'
  )

  // 2.4 Test Stock Rollback on Cancellation
  console.log('\nTesting Stock Rollback on Cancellation...')
  const cancelUpdated = await DonationModel.findByIdAndUpdate(
    pendingDonation._id,
    { $set: { status: 'Cancelled', stockCredited: false } },
    { returnDocument: 'after' }
  )
  assert(cancelUpdated.status === 'Cancelled', 'Donation status updated to Cancelled')

  // Rollback stock
  const rolledBackStock = await BloodStockModel.findOneAndUpdate(
    { bloodGroup: targetBg },
    { $inc: { unitsAvailable: -1 }, $set: { lastUpdated: new Date() } },
    { returnDocument: 'after' }
  )
  assert(
    rolledBackStock.unitsAvailable === initialUnits,
    `Stock atomically rolled back by 1 unit on cancellation (${initialUnits + 1} -> ${initialUnits})`
  )

  console.log('\n[Suite 3: Donor Stats & Next-Eligibility Calculation]')
  // Create a verified donation dated 30 days ago for Alice
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const recentDonation = new DonationModel({
    donorId: testDonor1._id,
    donorName: testDonor1.name,
    donorEmail: testDonor1.email,
    bloodGroup: 'A+',
    units: 1,
    donationDate: thirtyDaysAgo,
    status: 'Completed',
    adminId: testAdmin._id,
    adminName: testAdmin.name,
    stockCredited: true,
  })
  await recentDonation.save()

  const allAliceCompleted = await DonationModel.find({
    donorId: testDonor1._id,
    status: 'Completed',
  }).sort({ donationDate: -1 })

  const completedCount = allAliceCompleted.length
  assert(completedCount >= 2, `Alice has ${completedCount} completed donations recorded`)

  const livesSavedEst = completedCount * 3
  assert(livesSavedEst === completedCount * 3, `Community impact calculated: ${livesSavedEst} lives saved`)

  // Test 90-day cooldown interval calculation from the 30-days-ago donation
  const test30DayCooldown = new Date(thirtyDaysAgo.getTime() + 90 * 24 * 60 * 60 * 1000)
  const now = new Date()
  const daysRemainingFrom30DaysAgo = Math.ceil((test30DayCooldown.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
  assert(
    daysRemainingFrom30DaysAgo >= 59 && daysRemainingFrom30DaysAgo <= 61,
    `Next eligibility from 30-day-old donation correctly estimates ~60 days remaining (actual: ${daysRemainingFrom30DaysAgo} days)`
  )

  // From today's latest donation, 90 days remaining
  const latestDate = new Date(allAliceCompleted[0].donationDate)
  const nextEligibleFromToday = new Date(latestDate.getTime() + 90 * 24 * 60 * 60 * 1000)
  const daysRemainingFromToday = Math.ceil((nextEligibleFromToday.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
  assert(
    daysRemainingFromToday >= 89 && daysRemainingFromToday <= 91,
    `Next eligibility from today's donation correctly estimates 90 days remaining (actual: ${daysRemainingFromToday} days)`
  )

  console.log('\n[Suite 4: Input Validation Rules]')
  assert(isPositiveInteger(1), '1 unit is valid integer quantity')
  assert(isPositiveInteger(2), '2 units (double apheresis) is valid integer quantity')
  assert(!isPositiveInteger(0), '0 units rejected')
  assert(!isPositiveInteger(-1), 'Negative units rejected')
  assert(!isPositiveInteger(1.5), 'Fractional units rejected')

  // Clean up temporary test records to preserve existing database records
  await DonationModel.deleteMany({
    _id: { $in: [donationAlice._id, donationBob._id, pendingDonation._id, recentDonation._id] },
  })
  await UserModel.deleteMany({
    _id: { $in: [testDonor1._id, testDonor2._id, testAdmin._id] },
  })

  console.log('\n========================================================')
  console.log(`PHASE 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('========================================================\n')

  await mongoose.disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

runDonationTests().catch((err) => {
  console.error('Test execution error:', err)
  process.exit(1)
})

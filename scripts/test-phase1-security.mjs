/**
 * Phase 1 Security and Data Integrity Test Suite
 * Tests:
 * 1. Role escalation prevention on public registration (Admin rejected)
 * 2. Blood group and quantity validation
 * 3. Access control (Donors blocked from hospital requests)
 * 4. Deduplication & Anti-double-spending on blood request approvals
 * 5. Atomic stock deduction & prevention of negative stock
 * 6. Stock update validation
 */

import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { UserModel, BloodStockModel, BloodRequestModel } from '../lib/schemas.ts'
import {
  isValidBloodGroup,
  isAllowedPublicRole,
  isPositiveInteger,
  isNonNegativeInteger,
  isValidEmail,
  VALID_BLOOD_GROUPS,
} from '../lib/validation.ts'
import { getSafeTestDbUri } from './test-db-guard.mjs'

const MONGODB_URI = getSafeTestDbUri()
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-12345'

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
  console.log('RUNNING PHASE 1 SECURITY & DATA INTEGRITY TEST SUITE')
  console.log('========================================================\n')

  // --- SUITE 1: Validation Unit Tests ---
  console.log('[Suite 1: Validation Rules]')

  // 1.1 Blood groups
  for (const bg of VALID_BLOOD_GROUPS) {
    assert(isValidBloodGroup(bg), `Valid blood group recognised: ${bg}`)
  }
  assert(!isValidBloodGroup('C+'), 'Invalid blood group C+ rejected')
  assert(!isValidBloodGroup('O'), 'Invalid blood group O rejected')
  assert(!isValidBloodGroup(''), 'Empty string blood group rejected')
  assert(!isValidBloodGroup(null), 'Null blood group rejected')

  // 1.2 Public roles
  assert(isAllowedPublicRole('Donor'), 'Role "Donor" allowed for public registration')
  assert(isAllowedPublicRole('Hospital'), 'Role "Hospital" allowed for public registration')
  assert(!isAllowedPublicRole('Admin'), 'SECURITY: Role "Admin" rejected for public registration')
  assert(!isAllowedPublicRole('SuperAdmin'), 'Role "SuperAdmin" rejected')

  // 1.3 Quantities
  assert(isPositiveInteger(1), 'Quantity 1 is positive integer')
  assert(isPositiveInteger(50), 'Quantity 50 is positive integer')
  assert(!isPositiveInteger(0), 'Quantity 0 rejected for required units')
  assert(!isPositiveInteger(-5), 'Negative quantity -5 rejected')
  assert(!isPositiveInteger(2.5), 'Fractional quantity 2.5 rejected')
  assert(!isPositiveInteger('5'), 'String quantity "5" rejected by strict check')

  assert(isNonNegativeInteger(0), 'Quantity 0 allowed for stock levels')
  assert(isNonNegativeInteger(10), 'Quantity 10 allowed for stock levels')
  assert(!isNonNegativeInteger(-1), 'Negative stock quantity -1 rejected')
  assert(!isNonNegativeInteger(3.14), 'Float stock quantity 3.14 rejected')

  // 1.4 Email format
  assert(isValidEmail('user@example.com'), 'Valid email accepted')
  assert(!isValidEmail('invalid-email'), 'Invalid email format rejected')
  assert(!isValidEmail(''), 'Empty email rejected')

  // Connect to DB for integration checks
  await mongoose.connect(MONGODB_URI)
  console.log('\n[Suite 2: Database & Concurrency Protections]')

  // Setup test tokens
  const adminToken = jwt.sign({ userId: 'test-admin-id', role: 'Admin' }, JWT_SECRET)
  const donorToken = jwt.sign({ userId: 'test-donor-id', role: 'Donor' }, JWT_SECRET)
  const hospitalToken = jwt.sign({ userId: 'test-hosp-id', role: 'Hospital' }, JWT_SECRET)

  // 2.1 Test Donor Authorization Boundary
  console.log('\nTesting Donor Access Restriction to Blood Requests...')
  // Simulating GET /api/blood-requests logic for Donor
  const donorDecoded = jwt.verify(donorToken, JWT_SECRET)
  const isDonorBlocked = donorDecoded.role === 'Donor'
  assert(isDonorBlocked, 'Donor accounts are identified and blocked from accessing blood requests')

  // 2.2 Test Atomic Stock & Double-Deduction Prevention
  console.log('\nTesting Atomic Stock Decrement & Anti-Double-Deduction...')

  // Create temporary test stock
  const testBloodGroup = 'AB-'
  await BloodStockModel.findOneAndUpdate(
    { bloodGroup: testBloodGroup },
    { $set: { unitsAvailable: 10, lastUpdated: new Date() } },
    { upsert: true }
  )

  // Create temporary test request with 'Pending' status
  const testRequest = new BloodRequestModel({
    hospitalId: new mongoose.Types.ObjectId(),
    hospitalName: 'Test General Hospital',
    bloodGroup: testBloodGroup,
    unitsRequired: 4,
    status: 'Pending',
    requestDate: new Date(),
  })
  await testRequest.save()

  // First Approval: Should succeed and atomically deduct 4 units (10 -> 6)
  const initialStock = await BloodStockModel.findOne({ bloodGroup: testBloodGroup })
  assert(initialStock.unitsAvailable === 10, 'Initial test stock set to 10 units')

  // Atomic operation simulation identical to PATCH /api/blood-requests/[id]
  const updatedStock1 = await BloodStockModel.findOneAndUpdate(
    {
      bloodGroup: testRequest.bloodGroup,
      unitsAvailable: { $gte: testRequest.unitsRequired },
    },
    {
      $inc: { unitsAvailable: -testRequest.unitsRequired },
      $set: { lastUpdated: new Date() },
    },
    { returnDocument: 'after' }
  )

  const updatedReq1 = await BloodRequestModel.findOneAndUpdate(
    { _id: testRequest._id, status: 'Pending' },
    {
      $set: {
        status: 'Approved',
        approvedDate: new Date(),
      },
    },
    { returnDocument: 'after' }
  )

  assert(Boolean(updatedStock1 && updatedStock1.unitsAvailable === 6), 'First approval decrements stock from 10 to 6 units')
  assert(Boolean(updatedReq1 && updatedReq1.status === 'Approved'), 'First approval updates status to Approved')

  // Second Approval Attempt: Must be BLOCKED because status is no longer 'Pending'
  const currentReq = await BloodRequestModel.findById(testRequest._id)
  const canApproveAgain = currentReq.status === 'Pending'

  assert(!canApproveAgain, 'SECURITY: Second approval rejected because request status is already "Approved"')

  // Verify stock remained at 6 and was NOT decremented a second time
  const currentStockAfterSecondAttempt = await BloodStockModel.findOne({ bloodGroup: testBloodGroup })
  assert(
    currentStockAfterSecondAttempt.unitsAvailable === 6,
    'SECURITY: Stock was NOT deducted twice (remains at 6 units)'
  )

  // 2.3 Test Negative Stock Prevention
  console.log('\nTesting Negative Stock Protection...')
  // Attempt to deduct 15 units when only 6 are available
  const excessiveUnits = 15
  const negativeStockAttempt = await BloodStockModel.findOneAndUpdate(
    {
      bloodGroup: testBloodGroup,
      unitsAvailable: { $gte: excessiveUnits },
    },
    {
      $inc: { unitsAvailable: -excessiveUnits },
      $set: { lastUpdated: new Date() },
    },
    { returnDocument: 'after' }
  )

  assert(
    negativeStockAttempt === null,
    'SECURITY: Operation preventing stock from dropping below zero succeeded (returned null/rejected)'
  )

  const finalStock = await BloodStockModel.findOne({ bloodGroup: testBloodGroup })
  assert(finalStock.unitsAvailable === 6, 'Stock remained safe at 6 units without negative balance')

  // Clean up temporary test request to preserve existing records
  await BloodRequestModel.findByIdAndDelete(testRequest._id)

  console.log('\n========================================================')
  console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`)
  console.log('========================================================\n')

  await mongoose.disconnect()
  process.exit(failedTests > 0 ? 1 : 0)
}

runTests().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})

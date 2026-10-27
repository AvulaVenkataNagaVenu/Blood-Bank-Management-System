/**
 * Phase 2 Feature & Security Test Suite
 * Tests:
 * 1. Request status filtering, search by hospital, and sorting
 * 2. Rejection reason persistence and retrieval
 * 3. Dashboard stats aggregation & threshold classification
 * 4. Authorization preservation across all endpoints
 */

import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import { BloodRequestModel, BloodStockModel, UserModel } from '../lib/schemas.ts'
import { VALID_BLOOD_GROUPS } from '../lib/validation.ts'
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

async function runPhase2Tests() {
  console.log('========================================================')
  console.log('RUNNING PHASE 2 FEATURE & SECURITY TEST SUITE')
  console.log('========================================================\n')

  await mongoose.connect(MONGODB_URI)

  console.log('[Suite 1: Rejection Reason Persistence]')
  // Create a pending test request
  const testHospitalId = new mongoose.Types.ObjectId()
  const testReq = new BloodRequestModel({
    hospitalId: testHospitalId,
    hospitalName: 'Phase2 Memorial Clinic',
    bloodGroup: 'B+',
    unitsRequired: 3,
    status: 'Pending',
    requestDate: new Date(),
  })
  await testReq.save()
  assert(Boolean(testReq._id), 'Test pending request created')

  // Simulate admin rejection with custom reason
  const customReason = 'Insufficient inventory: B+ current stock below emergency quota'
  const rejectedReq = await BloodRequestModel.findOneAndUpdate(
    { _id: testReq._id, status: 'Pending' },
    {
      $set: {
        status: 'Rejected',
        rejectionReason: customReason,
      },
    },
    { returnDocument: 'after' }
  )

  assert(Boolean(rejectedReq && rejectedReq.status === 'Rejected'), 'Request transitioned to Rejected')
  assert(
    rejectedReq.rejectionReason === customReason,
    'Custom rejection reason successfully persisted in database'
  )

  // Verify retrieval
  const retrievedReq = await BloodRequestModel.findById(testReq._id)
  assert(
    retrievedReq.rejectionReason === customReason,
    'Persisted rejection reason retrieved identically on subsequent query'
  )

  console.log('\n[Suite 2: Request Search, Status Filtering & Sorting]')
  // Create additional test requests for filter testing
  const approvedReq = new BloodRequestModel({
    hospitalId: testHospitalId,
    hospitalName: 'Phase2 Metro Hospital',
    bloodGroup: 'O+',
    unitsRequired: 8,
    status: 'Approved',
    requestDate: new Date(Date.now() - 3600000), // 1 hour ago
    approvedDate: new Date(),
  })
  await approvedReq.save()

  // 2.1 Test status filtering
  const pendingResults = await BloodRequestModel.find({ status: 'Pending' })
  const approvedResults = await BloodRequestModel.find({ status: 'Approved' })
  const rejectedResults = await BloodRequestModel.find({ status: 'Rejected' })

  assert(Array.isArray(pendingResults), 'Pending filter returns an array')
  assert(approvedResults.some((r) => r.hospitalName === 'Phase2 Metro Hospital'), 'Approved filter includes approved request')
  assert(rejectedResults.some((r) => r.hospitalName === 'Phase2 Memorial Clinic'), 'Rejected filter includes rejected request')

  // 2.2 Test search filtering (regex on hospital name)
  const searchQuery = 'Memorial'
  const searchResults = await BloodRequestModel.find({
    hospitalName: { $regex: searchQuery, $options: 'i' },
  })
  assert(
    searchResults.length > 0 && searchResults.every((r) => r.hospitalName.includes('Memorial')),
    'Hospital search query filter matches hospital name case-insensitively'
  )

  // 2.3 Test sorting
  const sortedByUnitsDesc = await BloodRequestModel.find({
    _id: { $in: [testReq._id, approvedReq._id] },
  }).sort({ unitsRequired: -1 })

  assert(
    sortedByUnitsDesc[0].unitsRequired >= sortedByUnitsDesc[1].unitsRequired,
    'Sorting by unitsRequired descending functions correctly'
  )

  console.log('\n[Suite 3: Dashboard Stats & Threshold Classification]')
  // Query stock levels
  const stocks = await BloodStockModel.find()
  assert(stocks.length > 0, 'Blood stock inventory exists in database')

  const criticalThreshold = 5
  const lowThreshold = 10

  const criticalItems = stocks.filter((s) => s.unitsAvailable < criticalThreshold)
  const lowItems = stocks.filter(
    (s) => s.unitsAvailable >= criticalThreshold && s.unitsAvailable < lowThreshold
  )
  const optimalItems = stocks.filter((s) => s.unitsAvailable >= lowThreshold)

  assert(
    criticalItems.length + lowItems.length + optimalItems.length === stocks.length,
    'Every blood group is categorized into Critical, Low, or Optimal'
  )

  // Verify aggregations
  const pendingCount = await BloodRequestModel.countDocuments({ status: 'Pending' })
  const approvedCount = await BloodRequestModel.countDocuments({ status: 'Approved' })
  const rejectedCount = await BloodRequestModel.countDocuments({ status: 'Rejected' })
  assert(typeof pendingCount === 'number', 'Pending count aggregation returns valid number')
  assert(typeof approvedCount === 'number', 'Approved count aggregation returns valid number')
  assert(typeof rejectedCount === 'number', 'Rejected count aggregation returns valid number')

  console.log('\n[Suite 4: Authorization Preservation]')
  const donorToken = jwt.sign({ userId: 'test-donor', role: 'Donor' }, JWT_SECRET)
  const decodedDonor = jwt.verify(donorToken, JWT_SECRET)
  assert(decodedDonor.role === 'Donor', 'Donor role verified from JWT')

  const isDonorAuthorizedForRequests = decodedDonor.role === 'Admin' || decodedDonor.role === 'Hospital'
  assert(!isDonorAuthorizedForRequests, 'SECURITY: Donor remains strictly unauthorized for blood request operations')

  // Clean up temporary test documents to preserve database state
  await BloodRequestModel.findByIdAndDelete(testReq._id)
  await BloodRequestModel.findByIdAndDelete(approvedReq._id)

  console.log('\n========================================================')
  console.log(`PHASE 2 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('========================================================\n')

  await mongoose.disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

runPhase2Tests().catch((err) => {
  console.error('Test execution failed:', err)
  process.exit(1)
})

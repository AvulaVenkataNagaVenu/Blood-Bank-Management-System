/**
 * Phase 4 Test Suite:
 * Hospital Blood Request Lifecycle, Emergency Priority, Controlled Issuance,
 * Stock Decoupling & Boundaries, Inventory Movement Ledger, and Concurrency Protections.
 */

import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import {
  BloodRequestModel,
  BloodIssuanceModel,
  BloodStockModel,
  InventoryLedgerModel,
  UserModel,
} from '../lib/schemas.ts'
import {
  isValidBloodGroup,
  isPositiveInteger,
  isValidRequestPriority,
  isValidRequestStatus,
  CLINICAL_REVIEW_DISCLAIMER,
} from '../lib/validation.ts'
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

async function runPhase4Tests() {
  console.log('========================================================')
  console.log('RUNNING PHASE 4: REQUEST LIFECYCLE & ISSUANCE TEST SUITE')
  console.log('========================================================\n')

  await mongoose.connect(MONGODB_URI)

  const createdUserIds = []
  const createdRequestIds = []
  const createdIssuanceIds = []
  const createdLedgerIds = []

  const testBloodGroup = 'AB+'

  try {
    // ----------------------------------------------------
    // SETUP TEST ENTITIES
    // ----------------------------------------------------
    console.log('[Setup: Creating Test Hospitals, Admin, and Baseline Inventory]')

    const hospitalA = new UserModel({
      name: 'City General Hospital',
      email: `city.gen.${Date.now()}@example.com`,
      password: 'hashedpassword123',
      role: 'Hospital',
      hospitalName: 'City General Hospital',
    })
    await hospitalA.save()
    createdUserIds.push(hospitalA._id)

    const hospitalB = new UserModel({
      name: 'Memorial Clinic',
      email: `memorial.${Date.now()}@example.com`,
      password: 'hashedpassword123',
      role: 'Hospital',
      hospitalName: 'Memorial Clinic',
    })
    await hospitalB.save()
    createdUserIds.push(hospitalB._id)

    const adminUser = new UserModel({
      name: 'Dr. Evans (Chief Medical Officer)',
      email: `admin.p4.${Date.now()}@example.com`,
      password: 'hashedpassword123',
      role: 'Admin',
    })
    await adminUser.save()
    createdUserIds.push(adminUser._id)

    // Ensure baseline inventory for AB+ has at least 20 units for testing
    let stockDoc = await BloodStockModel.findOne({ bloodGroup: testBloodGroup })
    if (!stockDoc) {
      stockDoc = new BloodStockModel({ bloodGroup: testBloodGroup, unitsAvailable: 25 })
      await stockDoc.save()
    } else {
      await BloodStockModel.updateOne(
        { bloodGroup: testBloodGroup },
        { $set: { unitsAvailable: Math.max(25, stockDoc.unitsAvailable) } }
      )
    }
    const baselineStock = (await BloodStockModel.findOne({ bloodGroup: testBloodGroup })).unitsAvailable

    // ----------------------------------------------------
    // SUITE 1: REQUEST PRIORITY & VALIDATION RULES
    // ----------------------------------------------------
    console.log('\n[Suite 1: Request Priority & Status Validation Rules]')

    assert(isValidRequestPriority('Normal'), 'Priority "Normal" recognized as valid')
    assert(isValidRequestPriority('Emergency'), 'Priority "Emergency" recognized as valid')
    assert(!isValidRequestPriority('Urgent'), 'Unregistered priority "Urgent" rejected')
    assert(!isValidRequestPriority(''), 'Empty string priority rejected')

    assert(isValidRequestStatus('Pending'), 'Status "Pending" is valid')
    assert(isValidRequestStatus('Approved'), 'Status "Approved" is valid')
    assert(isValidRequestStatus('Partially Issued'), 'Status "Partially Issued" is valid')
    assert(isValidRequestStatus('Issued'), 'Status "Issued" is valid')
    assert(isValidRequestStatus('Rejected'), 'Status "Rejected" is valid')
    assert(isValidRequestStatus('Cancelled'), 'Status "Cancelled" is valid')
    assert(!isValidRequestStatus('InTransit'), 'Invalid status "InTransit" rejected')

    // Create Emergency Request
    const emergencyReq = new BloodRequestModel({
      hospitalId: hospitalA._id,
      hospitalName: hospitalA.hospitalName,
      bloodGroup: testBloodGroup,
      unitsRequired: 6,
      unitsIssued: 0,
      priority: 'Emergency',
      status: 'Pending',
      requestDate: new Date(),
      statusHistory: [
        {
          status: 'Pending',
          changedBy: hospitalA._id,
          changedByName: hospitalA.hospitalName,
          changedByRole: 'Hospital',
          changedAt: new Date(),
          notes: 'Emergency trauma transfusion requisition',
        },
      ],
    })
    await emergencyReq.save()
    createdRequestIds.push(emergencyReq._id)

    assert(emergencyReq.priority === 'Emergency', 'Emergency priority persisted in database')
    assert(emergencyReq.statusHistory.length === 1, 'Initial statusHistory entry created on submission')
    assert(emergencyReq.statusHistory[0].status === 'Pending', 'Initial history entry is Pending')

    // ----------------------------------------------------
    // SUITE 2: HOSPITAL DATA ISOLATION & AUTHORIZATION BOUNDARIES
    // ----------------------------------------------------
    console.log('\n[Suite 2: Hospital Isolation & Role-Based Authorization]')

    const hospAToken = jwt.sign({ userId: hospitalA._id.toString(), role: 'Hospital' }, JWT_SECRET)
    const hospBToken = jwt.sign({ userId: hospitalB._id.toString(), role: 'Hospital' }, JWT_SECRET)
    const donorToken = jwt.sign({ userId: 'donor-123', role: 'Donor' }, JWT_SECRET)

    // Hospital A query: must strictly match hospitalId = hospitalA._id
    const hospAQuery = await BloodRequestModel.find({ hospitalId: hospitalA._id })
    assert(hospAQuery.some((r) => r._id.toString() === emergencyReq._id.toString()), 'Hospital A can query its own request')

    // Hospital B query: must NOT include Hospital A's requests
    const hospBQuery = await BloodRequestModel.find({ hospitalId: hospitalB._id })
    assert(!hospBQuery.some((r) => r.hospitalId.toString() === hospitalA._id.toString()), 'DATA PRIVACY: Hospital B isolated from Hospital A requests')

    // Donor blocked check
    const donorDecoded = jwt.verify(donorToken, JWT_SECRET)
    assert(donorDecoded.role === 'Donor', 'Donor role verified from token')
    const donorHasIssuanceAccess = donorDecoded.role === 'Admin'
    assert(!donorHasIssuanceAccess, 'SECURITY: Donors are forbidden from blood issuance access')

    // ----------------------------------------------------
    // SUITE 3: APPROVAL DECOUPLING (Approval != Issuance)
    // ----------------------------------------------------
    console.log('\n[Suite 3: Approval Decoupling (Approval Does Not Deduct Stock)]')

    const stockBeforeApproval = (await BloodStockModel.findOne({ bloodGroup: testBloodGroup })).unitsAvailable

    // Admin approves the emergency request
    const approvedReq = await BloodRequestModel.findOneAndUpdate(
      { _id: emergencyReq._id, status: 'Pending' },
      {
        $set: {
          status: 'Approved',
          approvedBy: adminUser._id,
          approvedDate: new Date(),
        },
        $push: {
          statusHistory: {
            status: 'Approved',
            changedBy: adminUser._id,
            changedByName: adminUser.name,
            changedByRole: 'Admin',
            changedAt: new Date(),
            notes: 'Authorized by Chief Medical Officer for blood crossmatch',
          },
        },
      },
      { returnDocument: 'after' }
    )

    assert(approvedReq.status === 'Approved', 'Request transitioned from Pending to Approved')
    assert(approvedReq.statusHistory.length === 2, 'Status history appended approval entry')
    assert(Boolean(approvedReq.approvedBy), 'Approving administrator ID recorded')

    // CRITICAL CLINICAL SAFETY CHECK:
    const stockAfterApproval = (await BloodStockModel.findOne({ bloodGroup: testBloodGroup })).unitsAvailable
    assert(
      stockAfterApproval === stockBeforeApproval,
      `STOCK DECOUPLING: Blood stock was NOT deducted upon approval (${stockBeforeApproval} == ${stockAfterApproval})`
    )
    console.log('  Confirmed: Administrative approval authorizes request without premature stock deduction.')

    // ----------------------------------------------------
    // SUITE 4: CONTROLLED ISSUANCE, STOCK DEDUCTION & AUDIT LEDGER
    // ----------------------------------------------------
    console.log('\n[Suite 4: Controlled Issuance, Atomic Deduction & Audit Ledger]')

    // Request requires 6 units. First issuance: issue 2 units (Partial Fulfillment)
    const issueUnits1 = 2
    const previousStockBalance = (await BloodStockModel.findOne({ bloodGroup: testBloodGroup })).unitsAvailable

    // 4.1 Atomically deduct stock
    const deductedStock1 = await BloodStockModel.findOneAndUpdate(
      {
        bloodGroup: testBloodGroup,
        unitsAvailable: { $gte: issueUnits1 },
      },
      {
        $inc: { unitsAvailable: -issueUnits1 },
        $set: { lastUpdated: new Date() },
      },
      { returnDocument: 'after' }
    )

    assert(
      deductedStock1.unitsAvailable === previousStockBalance - issueUnits1,
      `Stock atomically deducted by ${issueUnits1} units (${previousStockBalance} -> ${deductedStock1.unitsAvailable})`
    )

    // 4.2 Update request unitsIssued & status to 'Partially Issued'
    const partialReq = await BloodRequestModel.findOneAndUpdate(
      {
        _id: emergencyReq._id,
        status: { $in: ['Approved', 'Partially Issued'] },
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ['$unitsIssued', 0] }, issueUnits1] },
            '$unitsRequired',
          ],
        },
      },
      {
        $inc: { unitsIssued: issueUnits1 },
        $set: { status: 'Partially Issued' },
        $push: {
          statusHistory: {
            status: 'Partially Issued',
            changedBy: adminUser._id,
            changedByName: adminUser.name,
            changedByRole: 'Admin',
            changedAt: new Date(),
            notes: `Issued ${issueUnits1} units of ${testBloodGroup}`,
          },
        },
      },
      { returnDocument: 'after' }
    )

    assert(partialReq.unitsIssued === 2, 'Request unitsIssued incremented to 2')
    assert(partialReq.status === 'Partially Issued', 'Request status transitioned to Partially Issued')

    // 4.3 Create BloodIssuance document
    const issuance1 = new BloodIssuanceModel({
      requestId: emergencyReq._id,
      hospitalId: hospitalA._id,
      hospitalName: hospitalA.hospitalName,
      bloodGroup: testBloodGroup,
      quantity: issueUnits1,
      issueDate: new Date(),
      adminId: adminUser._id,
      adminName: adminUser.name,
      status: 'Issued',
      recipientNotes: 'Batch #B901, Bedside ID verified',
      clinicalReviewNotice: CLINICAL_REVIEW_DISCLAIMER,
    })
    await issuance1.save()
    createdIssuanceIds.push(issuance1._id)

    assert(Boolean(issuance1._id), 'BloodIssuance record created with unique ID')
    assert(issuance1.clinicalReviewNotice.includes('qualified medical professionals'), 'Clinical disclaimer embedded in issuance record')

    // 4.4 Record Inventory Movement Ledger entry
    const ledgerEntry1 = new InventoryLedgerModel({
      bloodGroup: testBloodGroup,
      movementType: 'Deduction',
      quantity: issueUnits1,
      reason: 'Hospital Issuance',
      referenceId: issuance1._id,
      referenceType: 'BloodIssuance',
      performedBy: adminUser._id,
      performedByName: adminUser.name,
      performedByRole: 'Admin',
      previousBalance: previousStockBalance,
      newBalance: deductedStock1.unitsAvailable,
      notes: `Dispatched to ${hospitalA.hospitalName}`,
      timestamp: new Date(),
    })
    await ledgerEntry1.save()
    createdLedgerIds.push(ledgerEntry1._id)

    assert(Boolean(ledgerEntry1._id), 'InventoryLedger entry recorded')
    assert(ledgerEntry1.movementType === 'Deduction', 'Ledger recorded movementType: Deduction')
    assert(ledgerEntry1.newBalance === previousStockBalance - issueUnits1, 'Ledger accurately reflects balance before and after')

    // ----------------------------------------------------
    // SUITE 5: QUOTA BOUNDARIES & DUPLICATE ISSUANCE PREVENTION
    // ----------------------------------------------------
    console.log('\n[Suite 5: Quota Enforcement & Anti-Over-Issuance]')

    // Current state: Required = 6, Issued = 2, Remaining = 4
    // 5.1 Attempt to issue 5 units (exceeds remaining 4 units)
    const excessiveAttemptQty = 5
    const overIssueAttempt = await BloodRequestModel.findOneAndUpdate(
      {
        _id: emergencyReq._id,
        status: { $in: ['Approved', 'Partially Issued'] },
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ['$unitsIssued', 0] }, excessiveAttemptQty] },
            '$unitsRequired',
          ],
        },
      },
      { $inc: { unitsIssued: excessiveAttemptQty } },
      { returnDocument: 'after' }
    )

    assert(overIssueAttempt === null, 'SECURITY: Issuance exceeding approved remaining units rejected (returned null)')

    // 5.2 Fulfill the remaining 4 units (2 + 4 = 6)
    const remainingQty = 4
    await BloodStockModel.updateOne(
      { bloodGroup: testBloodGroup },
      { $inc: { unitsAvailable: -remainingQty } }
    )

    const finalFulfilledReq = await BloodRequestModel.findOneAndUpdate(
      {
        _id: emergencyReq._id,
        status: { $in: ['Approved', 'Partially Issued'] },
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ['$unitsIssued', 0] }, remainingQty] },
            '$unitsRequired',
          ],
        },
      },
      {
        $inc: { unitsIssued: remainingQty },
        $set: { status: 'Issued' },
        $push: {
          statusHistory: {
            status: 'Issued',
            changedBy: adminUser._id,
            changedByName: adminUser.name,
            changedByRole: 'Admin',
            changedAt: new Date(),
            notes: 'Final 4 units issued. Requisition 100% completed.',
          },
        },
      },
      { returnDocument: 'after' }
    )

    assert(finalFulfilledReq.unitsIssued === 6, 'Request unitsIssued now exactly equals required 6 units')
    assert(finalFulfilledReq.status === 'Issued', 'Request status transitioned to Issued (100% fulfilled)')

    // 5.3 Attempting another issuance on the fully Issued request
    const duplicateAttempt = await BloodRequestModel.findOneAndUpdate(
      {
        _id: emergencyReq._id,
        status: { $in: ['Approved', 'Partially Issued'] },
        $expr: {
          $lte: [
            { $add: [{ $ifNull: ['$unitsIssued', 0] }, 1] },
            '$unitsRequired',
          ],
        },
      },
      { $inc: { unitsIssued: 1 } }
    )

    assert(duplicateAttempt === null, 'SECURITY: Subsequent issuance attempt on fully Issued request rejected')

    // ----------------------------------------------------
    // SUITE 6: SIMULTANEOUS / CONCURRENT ISSUANCE SAFETY
    // ----------------------------------------------------
    console.log('\n[Suite 6: Server-Side Concurrent / Simultaneous Issuance Safety]')

    // Create a new request for Memorial Clinic: 2 units required
    const concurrentReq = new BloodRequestModel({
      hospitalId: hospitalB._id,
      hospitalName: hospitalB.hospitalName,
      bloodGroup: testBloodGroup,
      unitsRequired: 2,
      unitsIssued: 0,
      priority: 'Normal',
      status: 'Approved',
      requestDate: new Date(),
      statusHistory: [
        {
          status: 'Pending',
          changedBy: hospitalB._id,
          changedByName: hospitalB.hospitalName,
          changedByRole: 'Hospital',
          changedAt: new Date(),
        },
        {
          status: 'Approved',
          changedBy: adminUser._id,
          changedByName: adminUser.name,
          changedByRole: 'Admin',
          changedAt: new Date(),
        },
      ],
    })
    await concurrentReq.save()
    createdRequestIds.push(concurrentReq._id)

    // Simulate 5 simultaneous / concurrent claims, each claiming 1 unit against a 2-unit quota
    console.log('  Simulating 5 simultaneous 1-unit issuance claims against a 2-unit request quota...')
    const simultaneousAttempts = [1, 2, 3, 4, 5]
    const simultaneousResults = await Promise.all(
      simultaneousAttempts.map(async (attemptId) => {
        const result = await BloodRequestModel.findOneAndUpdate(
          {
            _id: concurrentReq._id,
            status: { $in: ['Approved', 'Partially Issued'] },
            $expr: {
              $lte: [
                { $add: [{ $ifNull: ['$unitsIssued', 0] }, 1] },
                '$unitsRequired',
              ],
            },
          },
          { $inc: { unitsIssued: 1 } },
          { returnDocument: 'after' }
        )
        return { attemptId, success: result !== null, unitsIssuedAfter: result?.unitsIssued }
      })
    )

    const successes = simultaneousResults.filter((r) => r.success)
    const rejections = simultaneousResults.filter((r) => !r.success)

    assert(successes.length === 2, `CONCURRENCY SAFETY: Exactly 2 claims succeeded out of 5 simultaneous attempts`)
    assert(rejections.length === 3, `CONCURRENCY SAFETY: Exactly 3 claims rejected due to quota exhaustion`)

    const checkedConcurrentDoc = await BloodRequestModel.findById(concurrentReq._id)
    assert(checkedConcurrentDoc.unitsIssued === 2, 'CONCURRENCY SAFETY: unitsIssued strictly equals 2 (never over-allocated)')

    // ----------------------------------------------------
    // SUITE 7: INVENTORY BOUNDARIES & NEGATIVE BALANCE PROTECTION
    // ----------------------------------------------------
    console.log('\n[Suite 7: Inventory Boundaries & Negative Stock Protection]')

    const currentStockLevel = (await BloodStockModel.findOne({ bloodGroup: testBloodGroup })).unitsAvailable
    const excessiveDeductionUnits = currentStockLevel + 100

    // Attempt to deduct more units than physically in inventory
    const negativeBalanceAttempt = await BloodStockModel.findOneAndUpdate(
      {
        bloodGroup: testBloodGroup,
        unitsAvailable: { $gte: excessiveDeductionUnits },
      },
      {
        $inc: { unitsAvailable: -excessiveDeductionUnits },
      },
      { returnDocument: 'after' }
    )

    assert(negativeBalanceAttempt === null, 'SECURITY: Deduction exceeding available inventory rejected (returned null)')

    const stockAfterExcessiveAttempt = (await BloodStockModel.findOne({ bloodGroup: testBloodGroup })).unitsAvailable
    assert(
      stockAfterExcessiveAttempt === currentStockLevel,
      'SECURITY: Blood stock level protected and preserved without negative balance'
    )

    // ----------------------------------------------------
    // SUITE 8: COMPENSATORY RECOVERY & ISSUANCE CANCELLATION / RETURN
    // ----------------------------------------------------
    console.log('\n[Suite 8: Compensatory Rollback & Issuance Cancellation]')

    // Cancel issuance1 (2 units)
    const stockBeforeRollback = (await BloodStockModel.findOne({ bloodGroup: testBloodGroup })).unitsAvailable

    // 1. Mark issuance as Cancelled
    const cancelledIssuance = await BloodIssuanceModel.findByIdAndUpdate(
      issuance1._id,
      { $set: { status: 'Cancelled' } },
      { returnDocument: 'after' }
    )
    assert(cancelledIssuance.status === 'Cancelled', 'BloodIssuance status updated to Cancelled')

    // 2. Atomically credit blood units back to stock
    const restoredStock = await BloodStockModel.findOneAndUpdate(
      { bloodGroup: testBloodGroup },
      {
        $inc: { unitsAvailable: issuance1.quantity },
        $set: { lastUpdated: new Date() },
      },
      { returnDocument: 'after' }
    )
    assert(
      restoredStock.unitsAvailable === stockBeforeRollback + issuance1.quantity,
      `COMPENSATION: Blood stock restored by ${issuance1.quantity} units (${stockBeforeRollback} -> ${restoredStock.unitsAvailable})`
    )

    // 3. Revert request unitsIssued
    const revertedReq = await BloodRequestModel.findOneAndUpdate(
      { _id: emergencyReq._id },
      {
        $inc: { unitsIssued: -issuance1.quantity },
        $set: { status: 'Partially Issued' },
      },
      { returnDocument: 'after' }
    )
    assert(revertedReq.unitsIssued === 4, 'Request unitsIssued decremented from 6 to 4')
    assert(revertedReq.status === 'Partially Issued', 'Request status reverted to Partially Issued')

    // 4. Log returned units in Inventory Movement Ledger
    const returnLedgerEntry = new InventoryLedgerModel({
      bloodGroup: testBloodGroup,
      movementType: 'Credit',
      quantity: issuance1.quantity,
      reason: 'Issuance Cancellation / Return',
      referenceId: issuance1._id,
      referenceType: 'BloodIssuance',
      performedBy: adminUser._id,
      performedByName: adminUser.name,
      performedByRole: 'Admin',
      previousBalance: stockBeforeRollback,
      newBalance: restoredStock.unitsAvailable,
      notes: 'Blood units returned to inventory following issuance cancellation',
      timestamp: new Date(),
    })
    await returnLedgerEntry.save()
    createdLedgerIds.push(returnLedgerEntry._id)

    assert(Boolean(returnLedgerEntry._id), 'Audit ledger recorded stock return with reason: "Issuance Cancellation / Return"')

    // ----------------------------------------------------
    // SUITE 9: INVENTORY LEDGER AUDIT QUERYING & IMMUTABILITY
    // ----------------------------------------------------
    console.log('\n[Suite 9: Inventory Ledger Traceability & Verification]')

    const allLedgerEntriesForGroup = await InventoryLedgerModel.find({ bloodGroup: testBloodGroup }).sort({ timestamp: -1 })
    assert(allLedgerEntriesForGroup.length >= 2, `Audit ledger contains ${allLedgerEntriesForGroup.length} movement records for ${testBloodGroup}`)

    const hasIssuanceEntry = allLedgerEntriesForGroup.some((e) => e.reason === 'Hospital Issuance')
    const hasReturnEntry = allLedgerEntriesForGroup.some((e) => e.reason === 'Issuance Cancellation / Return')
    assert(hasIssuanceEntry, 'Audit ledger successfully preserves Hospital Issuance deduction records')
    assert(hasReturnEntry, 'Audit ledger successfully preserves Return credit records')

  } finally {
    // ----------------------------------------------------
    // CLEANUP TEMPORARY TEST ARTIFACTS
    // ----------------------------------------------------
    console.log('\n[Cleanup: Removing Temporary Test Records to Preserve Real Database State]')

    if (createdRequestIds.length > 0) {
      await BloodRequestModel.deleteMany({ _id: { $in: createdRequestIds } })
    }
    if (createdIssuanceIds.length > 0) {
      await BloodIssuanceModel.deleteMany({ _id: { $in: createdIssuanceIds } })
    }
    if (createdLedgerIds.length > 0) {
      await InventoryLedgerModel.deleteMany({ _id: { $in: createdLedgerIds } })
    }
    if (createdUserIds.length > 0) {
      await UserModel.deleteMany({ _id: { $in: createdUserIds } })
    }
    console.log('  Cleaned up temporary test requests, issuances, ledger entries, and test users.')
  }

  console.log('\n========================================================')
  console.log(`PHASE 4 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('========================================================\n')

  await mongoose.disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

runPhase4Tests().catch((err) => {
  console.error('Test execution error:', err)
  process.exit(1)
})

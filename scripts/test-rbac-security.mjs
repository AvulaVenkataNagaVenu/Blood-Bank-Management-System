/**
 * Role-Based Access Control (RBAC) Security Verification Test Suite
 *
 * Verifies server-side authorization boundaries for:
 * 1. Hospital isolation (/api/blood-requests & /api/blood-issuances)
 * 2. Donor 403 Forbidden enforcement (requests, issuances, inventory ledger)
 * 3. Administrator authorized access (/api/blood-requests, /api/blood-issuances, /api/inventory-ledger)
 * 4. Unauthenticated request rejection (401 Unauthorized) across all endpoints
 * 5. Isolated test data lifecycle with automatic cleanup
 */

import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import {
  UserModel,
  BloodRequestModel,
  BloodIssuanceModel,
  InventoryLedgerModel,
} from '../lib/schemas.ts'
import { CLINICAL_REVIEW_DISCLAIMER } from '../lib/validation.ts'
import { getSafeTestDbUri } from './test-db-guard.mjs'

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000'
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

async function runSecurityTests() {
  console.log('========================================================================')
  console.log('RUNNING SERVER-SIDE ROLE-BASED ACCESS CONTROL (RBAC) SECURITY TESTS')
  console.log(`Target: ${BASE_URL}`)
  console.log('========================================================================\n')

  await mongoose.connect(MONGODB_URI)

  const createdUserIds = []
  const createdRequestIds = []
  const createdIssuanceIds = []

  const testPassword = 'SafePassword123!'
  const hashedPassword = await bcrypt.hash(testPassword, 10)

  try {
    // ----------------------------------------------------
    // SETUP: ISOLATED TEST USERS
    // ----------------------------------------------------
    console.log('[Setup: Creating Isolated Test Users and Seeding Entity IDs]')

    const timestamp = Date.now()

    // 1. Hospital A
    const userHospA = new UserModel({
      name: 'Security Test Hospital A',
      email: `sec.hospA.${timestamp}@example.com`,
      password: hashedPassword,
      role: 'Hospital',
      hospitalName: 'Security Test Hospital A',
    })
    await userHospA.save()
    createdUserIds.push(userHospA._id)

    // 2. Hospital B
    const userHospB = new UserModel({
      name: 'Security Test Hospital B',
      email: `sec.hospB.${timestamp}@example.com`,
      password: hashedPassword,
      role: 'Hospital',
      hospitalName: 'Security Test Hospital B',
    })
    await userHospB.save()
    createdUserIds.push(userHospB._id)

    // 3. Donor
    const userDonor = new UserModel({
      name: 'Security Test Donor',
      email: `sec.donor.${timestamp}@example.com`,
      password: hashedPassword,
      role: 'Donor',
      bloodGroup: 'O+',
    })
    await userDonor.save()
    createdUserIds.push(userDonor._id)

    // 4. Admin
    const userAdmin = new UserModel({
      name: 'Security Test Admin',
      email: `sec.admin.${timestamp}@example.com`,
      password: hashedPassword,
      role: 'Admin',
    })
    await userAdmin.save()
    createdUserIds.push(userAdmin._id)

    // Log in each role to obtain authentic server-issued HTTP session cookies
    const cookieHospA = await loginAndGetCookie(userHospA.email, testPassword)
    const cookieHospB = await loginAndGetCookie(userHospB.email, testPassword)
    const cookieDonor = await loginAndGetCookie(userDonor.email, testPassword)
    const cookieAdmin = await loginAndGetCookie(userAdmin.email, testPassword)

    assert(Boolean(cookieHospA), 'Hospital A authenticated and received session cookie')
    assert(Boolean(cookieHospB), 'Hospital B authenticated and received session cookie')
    assert(Boolean(cookieDonor), 'Donor authenticated and received session cookie')
    assert(Boolean(cookieAdmin), 'Admin authenticated and received session cookie')

    // Create an isolated request belonging to Hospital A
    const reqHospA = new BloodRequestModel({
      hospitalId: userHospA._id,
      hospitalName: userHospA.hospitalName,
      bloodGroup: 'B+',
      unitsRequired: 5,
      unitsIssued: 0,
      priority: 'Normal',
      status: 'Pending',
      requestDate: new Date(),
      statusHistory: [
        {
          status: 'Pending',
          changedBy: userHospA._id,
          changedByName: userHospA.hospitalName,
          changedByRole: 'Hospital',
          changedAt: new Date(),
        },
      ],
    })
    await reqHospA.save()
    createdRequestIds.push(reqHospA._id)

    // Create an isolated request belonging to Hospital B
    const reqHospB = new BloodRequestModel({
      hospitalId: userHospB._id,
      hospitalName: userHospB.hospitalName,
      bloodGroup: 'O+',
      unitsRequired: 4,
      unitsIssued: 0,
      priority: 'Emergency',
      status: 'Pending',
      requestDate: new Date(),
      statusHistory: [
        {
          status: 'Pending',
          changedBy: userHospB._id,
          changedByName: userHospB.hospitalName,
          changedByRole: 'Hospital',
          changedAt: new Date(),
        },
      ],
    })
    await reqHospB.save()
    createdRequestIds.push(reqHospB._id)

    // Create an isolated issuance belonging to Hospital B
    const issuanceHospB = new BloodIssuanceModel({
      requestId: reqHospB._id,
      hospitalId: userHospB._id,
      hospitalName: userHospB.hospitalName,
      bloodGroup: 'O+',
      quantity: 2,
      issueDate: new Date(),
      adminId: userAdmin._id,
      adminName: userAdmin.name,
      status: 'Issued',
      clinicalReviewNotice: CLINICAL_REVIEW_DISCLAIMER,
    })
    await issuanceHospB.save()
    createdIssuanceIds.push(issuanceHospB._id)

    // ====================================================
    // SUITE 1: UNAUTHENTICATED REQUESTS REJECTION (401)
    // ====================================================
    console.log('\n[Suite 1: Unauthenticated Requests Rejection (401 Unauthorized)]')

    const unauthReqs = [
      { method: 'GET', url: `${BASE_URL}/api/blood-requests`, name: 'GET /api/blood-requests' },
      {
        method: 'POST',
        url: `${BASE_URL}/api/blood-requests`,
        body: JSON.stringify({ bloodGroup: 'A+', unitsRequired: 2 }),
        name: 'POST /api/blood-requests',
      },
      { method: 'GET', url: `${BASE_URL}/api/blood-requests/${reqHospA._id}`, name: 'GET /api/blood-requests/[id]' },
      {
        method: 'PATCH',
        url: `${BASE_URL}/api/blood-requests/${reqHospA._id}`,
        body: JSON.stringify({ status: 'Approved' }),
        name: 'PATCH /api/blood-requests/[id]',
      },
      { method: 'GET', url: `${BASE_URL}/api/blood-issuances`, name: 'GET /api/blood-issuances' },
      {
        method: 'POST',
        url: `${BASE_URL}/api/blood-issuances`,
        body: JSON.stringify({ requestId: reqHospA._id.toString(), quantity: 1 }),
        name: 'POST /api/blood-issuances',
      },
      { method: 'GET', url: `${BASE_URL}/api/blood-issuances/${issuanceHospB._id}`, name: 'GET /api/blood-issuances/[id]' },
      {
        method: 'PATCH',
        url: `${BASE_URL}/api/blood-issuances/${issuanceHospB._id}`,
        body: JSON.stringify({ status: 'Cancelled' }),
        name: 'PATCH /api/blood-issuances/[id]',
      },
      { method: 'GET', url: `${BASE_URL}/api/inventory-ledger`, name: 'GET /api/inventory-ledger' },
    ]

    for (const test of unauthReqs) {
      const res = await fetch(test.url, {
        method: test.method,
        headers: test.body ? { 'Content-Type': 'application/json' } : {},
        body: test.body,
      })
      assert(res.status === 401, `SECURITY: Unauthenticated ${test.name} strictly rejected with 401 Unauthorized`)
    }

    // Test forged / invalid cookie rejection
    const forgedHeaders = { Cookie: 'authToken=forged.invalid.jwtTokenValue' }
    const forgedRes1 = await fetch(`${BASE_URL}/api/blood-requests`, { headers: forgedHeaders })
    assert(forgedRes1.status === 401, 'SECURITY: Forged cookie rejected with 401 on /api/blood-requests')

    const forgedRes2 = await fetch(`${BASE_URL}/api/blood-issuances`, { headers: forgedHeaders })
    assert(forgedRes2.status === 401, 'SECURITY: Forged cookie rejected with 401 on /api/blood-issuances')

    const forgedRes3 = await fetch(`${BASE_URL}/api/inventory-ledger`, { headers: forgedHeaders })
    assert(forgedRes3.status === 401, 'SECURITY: Forged cookie rejected with 401 on /api/inventory-ledger')

    const forgedRes4 = await fetch(`${BASE_URL}/api/blood-issuances/${issuanceHospB._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...forgedHeaders },
      body: JSON.stringify({ status: 'Cancelled' }),
    })
    assert(forgedRes4.status === 401, 'SECURITY: Forged cookie rejected with 401 on PATCH /api/blood-issuances/[id]')

    // ====================================================
    // SUITE 2: HOSPITAL DATA ISOLATION & PRIVACY BOUNDARIES
    // ====================================================
    console.log('\n[Suite 2: Hospital Data Isolation & Ownership Restrictions]')

    // 2.1 Hospital A queries blood requests: must ONLY receive its own requests
    const hospAGetRes = await fetch(`${BASE_URL}/api/blood-requests`, {
      headers: { Cookie: cookieHospA },
    })
    assert(hospAGetRes.status === 200, 'Hospital A can query /api/blood-requests (200 OK)')
    const hospAGetData = await hospAGetRes.json()
    const returnedReqsA = hospAGetData.data || []

    const containsOwnReq = returnedReqsA.some((r) => r._id === reqHospA._id.toString())
    const containsOtherReq = returnedReqsA.some((r) => r._id === reqHospB._id.toString())
    assert(containsOwnReq, 'DATA INTEGRITY: Hospital A list contains its own request')
    assert(!containsOtherReq, 'DATA PRIVACY: Hospital A list strictly excludes Hospital B request')

    // 2.2 Hospital A inspects its own request by ID
    const hospAOwnInspect = await fetch(`${BASE_URL}/api/blood-requests/${reqHospA._id}`, {
      headers: { Cookie: cookieHospA },
    })
    assert(hospAOwnInspect.status === 200, 'Hospital A can view its own request details by ID (200 OK)')

    // 2.3 Hospital A attempts to inspect Hospital B's request by ID -> 403 Forbidden
    const hospATamperInspect = await fetch(`${BASE_URL}/api/blood-requests/${reqHospB._id}`, {
      headers: { Cookie: cookieHospA },
    })
    assert(hospATamperInspect.status === 403, 'SECURITY: Hospital A receives 403 Forbidden attempting to view Hospital B request')

    // 2.4 Hospital A attempts to modify/cancel Hospital B's request -> 403 Forbidden
    const hospATamperModify = await fetch(`${BASE_URL}/api/blood-requests/${reqHospB._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHospA },
      body: JSON.stringify({ status: 'Cancelled' }),
    })
    assert(hospATamperModify.status === 403, 'SECURITY: Hospital A receives 403 Forbidden attempting to modify Hospital B request')

    // 2.5 Hospital A attempts to approve its own request -> 403 Forbidden (Only Admins can approve)
    const hospAApproveSelf = await fetch(`${BASE_URL}/api/blood-requests/${reqHospA._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHospA },
      body: JSON.stringify({ status: 'Approved' }),
    })
    assert(hospAApproveSelf.status === 403, 'SECURITY: Hospital A receives 403 Forbidden attempting to approve request')

    // 2.6 Hospital A queries issuances: must strictly exclude Hospital B issuances
    const hospAIssuancesRes = await fetch(`${BASE_URL}/api/blood-issuances`, {
      headers: { Cookie: cookieHospA },
    })
    assert(hospAIssuancesRes.status === 200, 'Hospital A can query /api/blood-issuances (200 OK)')
    const hospAIssuancesData = await hospAIssuancesRes.json()
    const issuancesListA = hospAIssuancesData.data || []
    const containsOtherIssuance = issuancesListA.some((i) => i._id === issuanceHospB._id.toString())
    assert(!containsOtherIssuance, 'DATA PRIVACY: Hospital A issuances list strictly excludes Hospital B issuance')

    // 2.7 Hospital A attempts to inspect Hospital B's issuance by ID -> 403 Forbidden
    const hospAInspectOtherIssuance = await fetch(`${BASE_URL}/api/blood-issuances/${issuanceHospB._id}`, {
      headers: { Cookie: cookieHospA },
    })
    assert(hospAInspectOtherIssuance.status === 403, 'SECURITY: Hospital A receives 403 Forbidden attempting to inspect Hospital B issuance')

    // 2.8 Hospital A attempts to issue blood products -> 403 Forbidden
    const hospAIssueAttempt = await fetch(`${BASE_URL}/api/blood-issuances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHospA },
      body: JSON.stringify({ requestId: reqHospA._id.toString(), quantity: 1 }),
    })
    assert(hospAIssueAttempt.status === 403, 'SECURITY: Hospital A receives 403 Forbidden attempting to issue blood products')

    // 2.9 Hospital A attempts to cancel an issuance -> 403 Forbidden
    const hospACancelIssuance = await fetch(`${BASE_URL}/api/blood-issuances/${issuanceHospB._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHospA },
      body: JSON.stringify({ status: 'Cancelled' }),
    })
    assert(hospACancelIssuance.status === 403, 'SECURITY: Hospital A receives 403 Forbidden attempting to cancel issuance')

    // 2.10 Hospital A attempts to read inventory audit ledger -> 403 Forbidden
    const hospALedgerRes = await fetch(`${BASE_URL}/api/inventory-ledger`, {
      headers: { Cookie: cookieHospA },
    })
    assert(hospALedgerRes.status === 403, 'SECURITY: Hospital A receives 403 Forbidden attempting to access /api/inventory-ledger')

    // ====================================================
    // SUITE 3: DONOR 403 FORBIDDEN ENFORCEMENT
    // ====================================================
    console.log('\n[Suite 3: Donor 403 Forbidden Boundary Enforcement]')

    // 3.1 Donor accessing blood requests endpoints
    const donorReqList = await fetch(`${BASE_URL}/api/blood-requests`, { headers: { Cookie: cookieDonor } })
    assert(donorReqList.status === 403, 'SECURITY: Donor receives 403 Forbidden on GET /api/blood-requests')

    const donorReqSubmit = await fetch(`${BASE_URL}/api/blood-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieDonor },
      body: JSON.stringify({ bloodGroup: 'A+', unitsRequired: 2 }),
    })
    assert(donorReqSubmit.status === 403, 'SECURITY: Donor receives 403 Forbidden on POST /api/blood-requests')

    const donorReqInspect = await fetch(`${BASE_URL}/api/blood-requests/${reqHospA._id}`, { headers: { Cookie: cookieDonor } })
    assert(donorReqInspect.status === 403, 'SECURITY: Donor receives 403 Forbidden on GET /api/blood-requests/[id]')

    const donorReqPatch = await fetch(`${BASE_URL}/api/blood-requests/${reqHospA._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieDonor },
      body: JSON.stringify({ status: 'Approved' }),
    })
    assert(donorReqPatch.status === 403, 'SECURITY: Donor receives 403 Forbidden on PATCH /api/blood-requests/[id]')

    // 3.2 Donor accessing blood issuances endpoints
    const donorIssuanceList = await fetch(`${BASE_URL}/api/blood-issuances`, { headers: { Cookie: cookieDonor } })
    assert(donorIssuanceList.status === 403, 'SECURITY: Donor receives 403 Forbidden on GET /api/blood-issuances')

    const donorIssuancePost = await fetch(`${BASE_URL}/api/blood-issuances`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieDonor },
      body: JSON.stringify({ requestId: reqHospA._id.toString(), quantity: 1 }),
    })
    assert(donorIssuancePost.status === 403, 'SECURITY: Donor receives 403 Forbidden on POST /api/blood-issuances')

    const donorIssuanceInspect = await fetch(`${BASE_URL}/api/blood-issuances/${issuanceHospB._id}`, { headers: { Cookie: cookieDonor } })
    assert(donorIssuanceInspect.status === 403, 'SECURITY: Donor receives 403 Forbidden on GET /api/blood-issuances/[id]')

    const donorIssuancePatch = await fetch(`${BASE_URL}/api/blood-issuances/${issuanceHospB._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieDonor },
      body: JSON.stringify({ status: 'Cancelled' }),
    })
    assert(donorIssuancePatch.status === 403, 'SECURITY: Donor receives 403 Forbidden on PATCH /api/blood-issuances/[id]')

    // 3.3 Donor accessing administrator inventory ledger
    const donorLedger = await fetch(`${BASE_URL}/api/inventory-ledger`, { headers: { Cookie: cookieDonor } })
    assert(donorLedger.status === 403, 'SECURITY: Donor receives 403 Forbidden on GET /api/inventory-ledger')

    // ====================================================
    // SUITE 4: ADMINISTRATOR AUTHORIZATION & ACCESS
    // ====================================================
    console.log('\n[Suite 4: Administrator Authorization & Access Verification]')

    // 4.1 Admin views blood requests across all hospitals
    const adminReqsRes = await fetch(`${BASE_URL}/api/blood-requests`, { headers: { Cookie: cookieAdmin } })
    assert(adminReqsRes.status === 200, 'Admin receives 200 OK on GET /api/blood-requests')
    const adminReqsData = await adminReqsRes.json()
    const allReqs = adminReqsData.data || []
    const seesHospA = allReqs.some((r) => r._id === reqHospA._id.toString())
    const seesHospB = allReqs.some((r) => r._id === reqHospB._id.toString())
    assert(seesHospA && seesHospB, 'ADMIN ACCESS: Administrator sees requests from both Hospital A and Hospital B')

    // 4.2 Admin inspects single request by ID
    const adminInspectA = await fetch(`${BASE_URL}/api/blood-requests/${reqHospA._id}`, { headers: { Cookie: cookieAdmin } })
    assert(adminInspectA.status === 200, 'Admin receives 200 OK inspecting request by ID')

    // 4.3 Admin updates/approves blood request
    const adminApprove = await fetch(`${BASE_URL}/api/blood-requests/${reqHospA._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
      body: JSON.stringify({ status: 'Approved' }),
    })
    assert(adminApprove.status === 200, 'Admin receives 200 OK approving blood request')

    // 4.4 Admin views blood issuances across hospitals
    const adminIssuancesRes = await fetch(`${BASE_URL}/api/blood-issuances`, { headers: { Cookie: cookieAdmin } })
    assert(adminIssuancesRes.status === 200, 'Admin receives 200 OK on GET /api/blood-issuances')

    // 4.5 Admin inspects single issuance by ID
    const adminInspectIssuance = await fetch(`${BASE_URL}/api/blood-issuances/${issuanceHospB._id}`, { headers: { Cookie: cookieAdmin } })
    assert(adminInspectIssuance.status === 200, 'Admin receives 200 OK inspecting issuance by ID')

    // 4.6 Admin can cancel/modify issuance via PATCH /api/blood-issuances/[id]
    const adminCancelIssuance = await fetch(`${BASE_URL}/api/blood-issuances/${issuanceHospB._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
      body: JSON.stringify({ status: 'Cancelled', reason: 'Administrative test cancellation' }),
    })
    assert(adminCancelIssuance.status === 200, 'Admin receives 200 OK modifying/cancelling issuance on PATCH /api/blood-issuances/[id]')

    // 4.7 Admin accesses inventory ledger
    const adminLedgerRes = await fetch(`${BASE_URL}/api/inventory-ledger`, { headers: { Cookie: cookieAdmin } })
    assert(adminLedgerRes.status === 200, 'Admin receives 200 OK accessing /api/inventory-ledger')
    const adminLedgerData = await adminLedgerRes.json()
    assert(Array.isArray(adminLedgerData.data), 'Inventory ledger returns audit records array to admin')

    // 4.8 Immutability check on inventory ledger (No POST/PUT/DELETE allowed)
    const ledgerPostRes = await fetch(`${BASE_URL}/api/inventory-ledger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieAdmin },
      body: JSON.stringify({ test: 123 }),
    })
    assert(ledgerPostRes.status === 405, 'AUDIT IMMUTABILITY: POST /api/inventory-ledger rejected with 405 Method Not Allowed')

    const ledgerDeleteRes = await fetch(`${BASE_URL}/api/inventory-ledger`, {
      method: 'DELETE',
      headers: { Cookie: cookieAdmin },
    })
    assert(ledgerDeleteRes.status === 405, 'AUDIT IMMUTABILITY: DELETE /api/inventory-ledger rejected with 405 Method Not Allowed')

  } finally {
    // ----------------------------------------------------
    // CLEANUP TEMPORARY TEST DATA
    // ----------------------------------------------------
    console.log('\n[Cleanup: Removing Temporary Security Test Records to Preserve Real Data]')

    if (createdRequestIds.length > 0) {
      await BloodRequestModel.deleteMany({ _id: { $in: createdRequestIds } })
    }
    if (createdIssuanceIds.length > 0) {
      await BloodIssuanceModel.deleteMany({ _id: { $in: createdIssuanceIds } })
    }
    if (createdUserIds.length > 0) {
      await UserModel.deleteMany({ _id: { $in: createdUserIds } })
    }
    console.log('  Cleaned up all temporary test users, requests, and issuances.')
  }

  console.log('\n========================================================================')
  console.log(`SECURITY TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('========================================================================\n')

  await mongoose.disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

runSecurityTests().catch((err) => {
  console.error('Security test execution error:', err)
  process.exit(1)
})

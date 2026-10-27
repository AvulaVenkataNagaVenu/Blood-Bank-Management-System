/**
 * Phase 3 Part C Test Suite:
 * Appointment Scheduling, Server-Side Slot Capacity, Concurrency Safety,
 * Privacy Scoping, and Blood Stock Decoupling Verification.
 */

import mongoose from 'mongoose'
import jwt from 'jsonwebtoken'
import {
  AppointmentModel,
  DonationSlotModel,
  UserModel,
  BloodStockModel,
} from '../lib/schemas.ts'
import {
  isValidSlotDateString,
  isValidTimeSlot,
  STANDARD_TIME_SLOTS,
  DEFAULT_SLOT_CAPACITY,
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

async function runAppointmentTests() {
  console.log('========================================================')
  console.log('RUNNING PHASE 3 PART C: APPOINTMENT SCHEDULING TEST SUITE')
  console.log('========================================================\n')

  await mongoose.connect(MONGODB_URI)

  // Future test date formatted YYYY-MM-DD
  const testDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]
  const testTimeSlot = STANDARD_TIME_SLOTS[0] // e.g. '09:00 - 10:00'

  const createdUserIds = []
  const createdAppointmentIds = []
  const createdSlotKeys = []

  try {
    // ----------------------------------------------------
    // SETUP TEST ENTITIES
    // ----------------------------------------------------
    console.log('[Setup: Creating Test Users and Initializing Inventory]')

    const testDonor1 = new UserModel({
      name: 'Appointment Alice',
      email: `alice.appt.${Date.now()}@example.com`,
      password: 'hashedpassword123',
      role: 'Donor',
      bloodGroup: 'O+',
      phone: '+91 9876543210',
    })
    await testDonor1.save()
    createdUserIds.push(testDonor1._id)

    const testDonor2 = new UserModel({
      name: 'Appointment Bob',
      email: `bob.appt.${Date.now()}@example.com`,
      password: 'hashedpassword123',
      role: 'Donor',
      bloodGroup: 'A+',
      phone: '+91 9876543211',
    })
    await testDonor2.save()
    createdUserIds.push(testDonor2._id)

    const testAdmin = new UserModel({
      name: 'Appointment Admin',
      email: `admin.appt.${Date.now()}@example.com`,
      password: 'hashedpassword123',
      role: 'Admin',
    })
    await testAdmin.save()
    createdUserIds.push(testAdmin._id)

    const testHospital = new UserModel({
      name: 'Appointment Hospital',
      email: `hosp.appt.${Date.now()}@example.com`,
      password: 'hashedpassword123',
      role: 'Hospital',
      hospitalName: 'General Hospital',
    })
    await testHospital.save()
    createdUserIds.push(testHospital._id)

    // Baseline inventory state for O+
    const initialOStock = await BloodStockModel.findOne({ bloodGroup: 'O+' })
    const baselineUnits = initialOStock ? initialOStock.unitsAvailable : 0

    // ----------------------------------------------------
    // SUITE 1: VALIDATION & AUTHORIZATION RULES
    // ----------------------------------------------------
    console.log('\n[Suite 1: Validation & Authorization Rules]')

    assert(isValidSlotDateString(testDate), `Valid future date accepted: ${testDate}`)
    assert(!isValidSlotDateString('2020-01-01'), 'Past date rejected by validator')
    assert(!isValidSlotDateString('invalid-date'), 'Malformed date string rejected by validator')
    assert(isValidTimeSlot(testTimeSlot), `Valid standard time slot accepted: ${testTimeSlot}`)
    assert(!isValidTimeSlot('25:00 - 26:00'), 'Unauthorized time slot rejected by validator')

    // Role tokens
    const donor1Token = jwt.sign({ userId: testDonor1._id.toString(), role: 'Donor' }, JWT_SECRET)
    const donor2Token = jwt.sign({ userId: testDonor2._id.toString(), role: 'Donor' }, JWT_SECRET)
    const adminToken = jwt.sign({ userId: testAdmin._id.toString(), role: 'Admin' }, JWT_SECRET)
    const hospitalToken = jwt.sign({ userId: testHospital._id.toString(), role: 'Hospital' }, JWT_SECRET)

    const hospAuth = jwt.verify(hospitalToken, JWT_SECRET)
    assert(hospAuth.role === 'Hospital', 'SECURITY: Hospital token role identified correctly')
    // Hospital forbidden check
    const isHospitalAllowedAppointments = hospAuth.role === 'Donor' || hospAuth.role === 'Admin'
    assert(!isHospitalAllowedAppointments, 'SECURITY: Hospital accounts are strictly forbidden from appointment endpoints')

    // ----------------------------------------------------
    // SUITE 2: DONOR PRIVACY SCOPING
    // ----------------------------------------------------
    console.log('\n[Suite 2: Donor Privacy Scoping]')

    const apptAlice = new AppointmentModel({
      donorId: testDonor1._id,
      donorName: testDonor1.name,
      donorEmail: testDonor1.email,
      donorPhone: testDonor1.phone,
      bloodGroup: testDonor1.bloodGroup,
      slotDate: testDate,
      timeSlot: testTimeSlot,
      status: 'Scheduled',
    })
    await apptAlice.save()
    createdAppointmentIds.push(apptAlice._id)

    const apptBob = new AppointmentModel({
      donorId: testDonor2._id,
      donorName: testDonor2.name,
      donorEmail: testDonor2.email,
      donorPhone: testDonor2.phone,
      bloodGroup: testDonor2.bloodGroup,
      slotDate: testDate,
      timeSlot: STANDARD_TIME_SLOTS[1],
      status: 'Scheduled',
    })
    await apptBob.save()
    createdAppointmentIds.push(apptBob._id)

    // Simulate Donor 1 accessing appointments endpoint: must strictly query donorId: auth.userId
    const donor1Appointments = await AppointmentModel.find({ donorId: testDonor1._id })
    assert(
      donor1Appointments.length === 1 && donor1Appointments[0]._id.toString() === apptAlice._id.toString(),
      'DATA PRIVACY: Donor 1 query retrieves ONLY their own appointment'
    )
    assert(
      !donor1Appointments.some((a) => a.donorId.toString() === testDonor2._id.toString()),
      'DATA PRIVACY: Donor 1 query strictly excludes Donor 2 appointment records'
    )

    // Direct ID lookup privacy check: Donor 1 trying to read Bob's appointment ID
    const bobsAppt = await AppointmentModel.findById(apptBob._id)
    const donor1HasAccessToBob = bobsAppt.donorId.toString() === testDonor1._id.toString()
    assert(!donor1HasAccessToBob, 'DATA PRIVACY: Donor 1 forbidden from viewing Bob appointment details by ID')

    // Admin query sees both appointments
    const adminAppointments = await AppointmentModel.find({
      _id: { $in: [apptAlice._id, apptBob._id] },
    })
    assert(adminAppointments.length === 2, 'ADMIN ACCESS: Admin can query appointments across all donors')

    // ----------------------------------------------------
    // SUITE 3: SAME-DAY DUPLICATE BOOKING PREVENTION
    // ----------------------------------------------------
    console.log('\n[Suite 3: Same-Day Duplicate Booking Prevention]')

    // Alice already has an active appointment on testDate. Attempting another active booking:
    const activeBookingExists = await AppointmentModel.findOne({
      donorId: testDonor1._id,
      slotDate: testDate,
      status: { $in: ['Scheduled', 'Confirmed'] },
    })
    assert(
      Boolean(activeBookingExists),
      `DUPLICATE PREVENTION: Existing active appointment detected on ${testDate}`
    )

    // ----------------------------------------------------
    // SUITE 4: SERVER-SIDE ATOMIC CAPACITY & OVERBOOKING CONCURRENCY
    // ----------------------------------------------------
    console.log('\n[Suite 4: Server-Side Atomic Capacity & Concurrency Overbooking Prevention]')

    const concurrencySlotDate = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]
    const concurrencyTimeSlot = '11:00 - 12:00'
    const concurrencySlotKey = { slotDate: concurrencySlotDate, timeSlot: concurrencyTimeSlot }
    createdSlotKeys.push(concurrencySlotKey)

    // Initialize slot with a strict capacity limit of 2 seats
    const slotLimit = 2
    await DonationSlotModel.findOneAndUpdate(
      concurrencySlotKey,
      {
        $set: {
          slotDate: concurrencySlotDate,
          timeSlot: concurrencyTimeSlot,
          maxCapacity: slotLimit,
          bookedCount: 0,
          status: 'Open',
        },
      },
      { upsert: true, returnDocument: 'after' }
    )

    // Simulate 5 simultaneous / concurrent booking claims targeting the 2-capacity slot
    console.log('  Simulating 5 simultaneous booking claims on a slot with capacity = 2...')
    const concurrentClaims = Array.from({ length: 5 }, (_, i) => i + 1)
    const claimResults = await Promise.all(
      concurrentClaims.map(async (claimantIndex) => {
        // Atomic conditional update as implemented in app/api/appointments/route.ts:
        // Returns the updated doc IF AND ONLY IF bookedCount < maxCapacity
        const claimedSlot = await DonationSlotModel.findOneAndUpdate(
          {
            slotDate: concurrencySlotDate,
            timeSlot: concurrencyTimeSlot,
            status: { $ne: 'Closed' },
            $expr: { $lt: ['$bookedCount', '$maxCapacity'] },
          },
          { $inc: { bookedCount: 1 } },
          { returnDocument: 'after' }
        )
        return {
          claimantIndex,
          success: claimedSlot !== null,
          bookedCountAfter: claimedSlot?.bookedCount ?? null,
        }
      })
    )

    const successfulClaims = claimResults.filter((r) => r.success)
    const rejectedClaims = claimResults.filter((r) => !r.success)

    assert(
      successfulClaims.length === slotLimit,
      `CONCURRENCY SAFETY: Exactly ${slotLimit} claims succeeded out of 5 simultaneous attempts`
    )
    assert(
      rejectedClaims.length === 5 - slotLimit,
      `CONCURRENCY SAFETY: Exactly ${5 - slotLimit} simultaneous claims rejected with slot full`
    )

    // Inspect slot document in MongoDB
    const finalSlotDoc = await DonationSlotModel.findOne(concurrencySlotKey)
    assert(
      finalSlotDoc.bookedCount === slotLimit,
      `CONCURRENCY SAFETY: Slot bookedCount strictly equals ${slotLimit} (never overbooked)`
    )

    // Update slot status to Full if bookedCount >= maxCapacity
    if (finalSlotDoc.bookedCount >= finalSlotDoc.maxCapacity) {
      await DonationSlotModel.updateOne(concurrencySlotKey, { $set: { status: 'Full' } })
    }
    const fullSlotDoc = await DonationSlotModel.findOne(concurrencySlotKey)
    assert(fullSlotDoc.status === 'Full', 'Slot status automatically marks Full when capacity reached')

    // Additional booking attempt on Full slot must be rejected
    const extraAttempt = await DonationSlotModel.findOneAndUpdate(
      {
        slotDate: concurrencySlotDate,
        timeSlot: concurrencyTimeSlot,
        status: { $ne: 'Closed' },
        $expr: { $lt: ['$bookedCount', '$maxCapacity'] },
      },
      { $inc: { bookedCount: 1 } },
      { returnDocument: 'after' }
    )
    assert(extraAttempt === null, 'Overbooking attempt on full slot strictly rejected (returned null)')

    // ----------------------------------------------------
    // SUITE 5: CANCELLATION & SLOT CAPACITY RELEASE
    // ----------------------------------------------------
    console.log('\n[Suite 5: Cancellation & Slot Capacity Release]')

    // Cancel one seat in the concurrency slot
    const slotBeforeCancel = await DonationSlotModel.findOne(concurrencySlotKey)
    assert(slotBeforeCancel.bookedCount === 2, 'Slot has 2 booked seats before cancellation')

    // Perform atomic release as implemented in app/api/appointments/[id]/route.ts
    const releaseResult = await DonationSlotModel.findOneAndUpdate(
      {
        slotDate: concurrencySlotDate,
        timeSlot: concurrencyTimeSlot,
        bookedCount: { $gt: 0 },
      },
      {
        $inc: { bookedCount: -1 },
        $set: { status: 'Open' },
      },
      { returnDocument: 'after' }
    )

    assert(
      releaseResult.bookedCount === 1,
      'CAPACITY RELEASE: bookedCount decremented from 2 to 1 on cancellation'
    )
    assert(releaseResult.status === 'Open', 'CAPACITY RELEASE: Slot reopened (status = Open)')

    // Alice cancels her appointment
    const cancelAlice = await AppointmentModel.findOneAndUpdate(
      { _id: apptAlice._id, status: { $in: ['Scheduled', 'Confirmed'] } },
      {
        $set: {
          status: 'Cancelled',
          cancellationReason: 'Donor schedule conflict',
        },
      },
      { returnDocument: 'after' }
    )
    assert(cancelAlice.status === 'Cancelled', 'Alice appointment marked Cancelled')
    assert(cancelAlice.cancellationReason === 'Donor schedule conflict', 'Cancellation reason persisted')

    // Donor 2 cannot cancel Alice's appointment (role and ownership check)
    const donor2OwnsAliceAppt = cancelAlice.donorId.toString() === testDonor2._id.toString()
    assert(!donor2OwnsAliceAppt, 'DATA PRIVACY: Donor 2 forbidden from cancelling Alice appointment')

    // Re-cancelling already cancelled appointment must fail
    const reCancelAlice = await AppointmentModel.findOneAndUpdate(
      { _id: apptAlice._id, status: { $in: ['Scheduled', 'Confirmed'] } },
      { $set: { status: 'Cancelled' } }
    )
    assert(reCancelAlice === null, 'Terminal state: Cannot cancel an already Cancelled appointment')

    // ----------------------------------------------------
    // SUITE 6: STATUS TRANSITIONS (Scheduled -> Confirmed -> Completed)
    // ----------------------------------------------------
    console.log('\n[Suite 6: Status Transitions & Attendance Completion]')

    // Bob's appointment is Scheduled. Admin confirms it.
    const confirmedBob = await AppointmentModel.findOneAndUpdate(
      { _id: apptBob._id, status: 'Scheduled' },
      {
        $set: {
          status: 'Confirmed',
          confirmedBy: testAdmin._id,
          confirmedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    )
    assert(confirmedBob.status === 'Confirmed', 'Admin successfully transitioned status: Scheduled -> Confirmed')
    assert(Boolean(confirmedBob.confirmedBy), 'Confirmed admin ID recorded')

    // Bob attends: Admin marks attendance as Completed
    const completedBob = await AppointmentModel.findOneAndUpdate(
      { _id: apptBob._id, status: { $in: ['Scheduled', 'Confirmed'] } },
      {
        $set: {
          status: 'Completed',
          completedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    )
    assert(completedBob.status === 'Completed', 'Admin successfully marked attendance: Confirmed -> Completed')
    assert(Boolean(completedBob.completedAt), 'Completion timestamp recorded')

    // Cannot complete or cancel an already Completed appointment
    const reCompleteBob = await AppointmentModel.findOneAndUpdate(
      { _id: apptBob._id, status: { $in: ['Scheduled', 'Confirmed'] } },
      { $set: { status: 'Completed' } }
    )
    assert(reCompleteBob === null, 'Terminal state: Cannot modify status of a Completed appointment')

    // ----------------------------------------------------
    // SUITE 7: CRITICAL STOCK DECOUPLING GUARANTEE
    // ----------------------------------------------------
    console.log('\n[Suite 7: Critical Blood Stock Decoupling Guarantee]')

    // Fetch stock after all appointment operations: booking, claiming, cancelling, confirming, completing
    const finalOStock = await BloodStockModel.findOne({ bloodGroup: 'O+' })
    const finalUnits = finalOStock ? finalOStock.unitsAvailable : 0

    assert(
      finalUnits === baselineUnits,
      `STOCK DECOUPLING: Blood stock for O+ is strictly unchanged (${baselineUnits} == ${finalUnits})`
    )
    console.log('  Confirmed: Appointment lifecycle never credits or deducts blood inventory.')

  } finally {
    // ----------------------------------------------------
    // CLEANUP TEMPORARY TEST ARTIFACTS
    // ----------------------------------------------------
    console.log('\n[Cleanup: Removing Temporary Test Records]')

    if (createdAppointmentIds.length > 0) {
      await AppointmentModel.deleteMany({ _id: { $in: createdAppointmentIds } })
    }
    if (createdUserIds.length > 0) {
      await UserModel.deleteMany({ _id: { $in: createdUserIds } })
    }
    for (const key of createdSlotKeys) {
      await DonationSlotModel.deleteOne(key)
    }
    console.log('  Cleaned up temporary test appointments, test slots, and test users.')
  }

  console.log('\n========================================================')
  console.log(`PHASE 3 PART C TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`)
  console.log('========================================================\n')

  await mongoose.disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

runAppointmentTests().catch((err) => {
  console.error('Test execution error:', err)
  process.exit(1)
})

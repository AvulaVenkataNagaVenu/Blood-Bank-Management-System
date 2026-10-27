import { NextRequest, NextResponse } from 'next/server'
import { connectDB } from '@/lib/db'
import { BloodRequestModel, UserModel } from '@/lib/schemas'
import { verifyAuth } from '@/middleware/auth'
import { notifyAdmins } from '@/lib/notifications'
import {
  isValidBloodGroup,
  isPositiveInteger,
  isValidRequestPriority,
  isValidRequestStatus,
} from '@/lib/validation'
import type { ApiResponse } from '@/lib/types'

export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Authentication required.' }, { status: 401 })
    }

    if (auth.role !== 'Hospital') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Only hospital accounts can submit blood requests.' },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { bloodGroup, unitsRequired, priority } = body

    if (!isValidBloodGroup(bloodGroup)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please provide a valid blood group (O+, O-, A+, A-, B+, B-, AB+, AB-).',
        },
        { status: 400 }
      )
    }

    const units = typeof unitsRequired === 'string' ? parseInt(unitsRequired, 10) : unitsRequired
    if (!isPositiveInteger(units)) {
      return NextResponse.json(
        { success: false, error: 'Units required must be a positive whole number greater than 0.' },
        { status: 400 }
      )
    }

    if (units > 200) {
      return NextResponse.json(
        { success: false, error: 'Maximum allowable single request limit is 200 units.' },
        { status: 400 }
      )
    }

    const reqPriority = priority && isValidRequestPriority(priority) ? priority : 'Normal'

    const user = await UserModel.findById(auth.userId)
    if (!user) {
      return NextResponse.json({ success: false, error: 'Hospital user profile not found.' }, { status: 404 })
    }

    const hospitalName = user.hospitalName || user.name

    const bloodRequest = new BloodRequestModel({
      hospitalId: auth.userId,
      hospitalName,
      bloodGroup,
      unitsRequired: units,
      unitsIssued: 0,
      priority: reqPriority,
      status: 'Pending',
      requestDate: new Date(),
      statusHistory: [
        {
          status: 'Pending',
          changedBy: auth.userId,
          changedByName: hospitalName,
          changedByRole: 'Hospital',
          changedAt: new Date(),
          notes:
            reqPriority === 'Emergency'
              ? 'Emergency transfusion request submitted by hospital'
              : 'Routine blood request submitted by hospital',
        },
      ],
    })

    await bloodRequest.save()

    // Non-blocking notification dispatch to all Administrators
    await notifyAdmins({
      type: 'RequestSubmitted',
      title: reqPriority === 'Emergency' ? 'Emergency Blood Request Submitted' : 'New Blood Request Submitted',
      message: `New ${reqPriority} request for ${units} unit(s) of ${bloodGroup} from ${hospitalName}.`,
      priority: reqPriority === 'Emergency' ? 'Emergency' : 'Normal',
      referenceId: bloodRequest._id,
      referenceType: 'BloodRequest',
      eventKey: `request:submit:${bloodRequest._id}`,
    })

    return NextResponse.json(
      {
        success: true,
        data: bloodRequest,
        message:
          reqPriority === 'Emergency'
            ? 'Emergency blood request flagged and submitted successfully.'
            : 'Blood request submitted successfully.',
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('[requests] Create blood request error occurred')
    return NextResponse.json(
      { success: false, error: 'Failed to create blood request due to a server error.' },
      { status: 500 }
    )
  }
}

export async function GET(req: NextRequest): Promise<NextResponse<ApiResponse<any>>> {
  try {
    await connectDB()

    const auth = await verifyAuth(req)
    if (!auth) {
      return NextResponse.json({ success: false, error: 'Unauthorized: Authentication required.' }, { status: 401 })
    }

    // Security: Donors have no operational need or permission to view hospital requests
    if (auth.role === 'Donor') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Donors are not permitted to access blood requests.' },
        { status: 403 }
      )
    }

    let query: Record<string, any> = {}

    if (auth.role === 'Hospital') {
      // Hospital can only query their own requests
      query.hospitalId = auth.userId
    } else if (auth.role === 'Admin') {
      // Admin sees all requests
      query = {}
    } else {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions.' },
        { status: 403 }
      )
    }

    // Query parameters for search, filtering, and sorting
    const { searchParams } = new URL(req.url)
    const statusFilter = searchParams.get('status')
    const bloodGroupFilter = searchParams.get('bloodGroup')
    const priorityFilter = searchParams.get('priority')
    const searchQuery = searchParams.get('search')
    const sortBy = searchParams.get('sortBy')
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1

    if (statusFilter && isValidRequestStatus(statusFilter)) {
      query.status = statusFilter
    }

    if (bloodGroupFilter && isValidBloodGroup(bloodGroupFilter)) {
      query.bloodGroup = bloodGroupFilter
    }

    if (priorityFilter && isValidRequestPriority(priorityFilter)) {
      query.priority = priorityFilter
    }

    if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim().length > 0) {
      const sanitized = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      query.$or = [
        { hospitalName: { $regex: sanitized, $options: 'i' } },
        { bloodGroup: { $regex: sanitized, $options: 'i' } },
      ]
    }

    const sortOptions: Record<string, 1 | -1> = {}
    if (sortBy === 'unitsRequired') {
      sortOptions.unitsRequired = sortOrder
    } else if (sortBy === 'hospitalName') {
      sortOptions.hospitalName = sortOrder
    } else if (sortBy === 'requestDate') {
      sortOptions.requestDate = sortOrder
    } else if (sortBy === 'priority') {
      sortOptions.priority = sortOrder
    } else {
      sortOptions.createdAt = sortOrder
    }

    const bloodRequests = await BloodRequestModel.find(query).sort(sortOptions)

    return NextResponse.json(
      {
        success: true,
        data: bloodRequests,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('[requests] Get blood requests error occurred')
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve blood requests.' },
      { status: 500 }
    )
  }
}

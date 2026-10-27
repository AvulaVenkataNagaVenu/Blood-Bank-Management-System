import type { Types } from 'mongoose'

export type BloodGroup = 'O+' | 'O-' | 'A+' | 'A-' | 'B+' | 'B-' | 'AB+' | 'AB-'
export type UserRole = 'Admin' | 'Donor' | 'Hospital'
export type RequestPriority = 'Normal' | 'Emergency'
export type RequestStatus =
  | 'Pending'
  | 'Approved'
  | 'Partially Issued'
  | 'Issued'
  | 'Rejected'
  | 'Cancelled'

export interface RequestStatusHistoryEntry {
  status: RequestStatus
  changedBy: Types.ObjectId | string
  changedByName: string
  changedByRole: UserRole
  changedAt: Date
  reason?: string
  notes?: string
}

export interface User {
  _id?: Types.ObjectId | string
  name: string
  email: string
  password?: string
  role: UserRole
  bloodGroup?: BloodGroup
  phone?: string
  hospitalName?: string
  createdAt?: Date
  updatedAt?: Date
  credentialVersion?: number
}

export interface BloodStock {
  _id?: Types.ObjectId | string
  bloodGroup: BloodGroup
  unitsAvailable: number
  lastUpdated?: Date
  createdAt?: Date
  updatedAt?: Date
}

export interface BloodRequest {
  _id?: Types.ObjectId | string
  hospitalId: Types.ObjectId | string
  hospitalName: string
  bloodGroup: BloodGroup
  unitsRequired: number
  unitsIssued?: number
  priority: RequestPriority
  status: RequestStatus
  rejectionReason?: string
  cancellationReason?: string
  approvedBy?: Types.ObjectId | string
  requestDate?: Date
  approvedDate?: Date
  statusHistory?: RequestStatusHistoryEntry[]
  createdAt?: Date
  updatedAt?: Date
}

export type IssuanceStatus = 'Issued' | 'Cancelled'

export interface BloodIssuance {
  _id?: Types.ObjectId | string
  requestId: Types.ObjectId | string
  hospitalId: Types.ObjectId | string
  hospitalName: string
  bloodGroup: BloodGroup
  quantity: number
  issueDate: Date
  adminId: Types.ObjectId | string
  adminName: string
  status: IssuanceStatus
  recipientNotes?: string
  clinicalReviewNotice: string
  createdAt?: Date
  updatedAt?: Date
}

export type MovementType = 'Credit' | 'Deduction'
export type MovementReason =
  | 'Donation Credit'
  | 'Hospital Issuance'
  | 'Administrative Correction'
  | 'Discard / Expired'
  | 'Issuance Cancellation / Return'

export interface InventoryLedger {
  _id?: Types.ObjectId | string
  bloodGroup: BloodGroup
  movementType: MovementType
  quantity: number
  reason: MovementReason
  referenceId?: Types.ObjectId | string
  referenceType?: 'Donation' | 'BloodIssuance' | 'BloodRequest' | 'ManualAdjustment'
  performedBy: Types.ObjectId | string
  performedByName: string
  performedByRole: UserRole
  previousBalance: number
  newBalance: number
  notes?: string
  timestamp: Date
  createdAt?: Date
  updatedAt?: Date
}

export type DonationStatus = 'Pending' | 'Completed' | 'Cancelled'

export interface Donation {
  _id?: Types.ObjectId | string
  donorId: Types.ObjectId | string
  donorName: string
  donorEmail?: string
  bloodGroup: BloodGroup
  units: number
  donationDate: Date
  status: DonationStatus
  adminId: Types.ObjectId | string
  adminName: string
  notes?: string
  stockCredited: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface DonorStats {
  completedDonations: number
  totalUnitsDonated: number
  livesSavedEstimate: number
  lastDonationDate: string | null
  nextEligibleDateEstimate: string | null
  isEligibleEstimate: boolean
  daysRemainingEstimate: number
  medicalNotice: string
}

export type AppointmentStatus = 'Scheduled' | 'Confirmed' | 'Completed' | 'Cancelled'

export interface Appointment {
  _id?: Types.ObjectId | string
  donorId: Types.ObjectId | string
  donorName: string
  donorEmail: string
  donorPhone?: string
  bloodGroup?: BloodGroup
  slotDate: string
  timeSlot: string
  status: AppointmentStatus
  notes?: string
  cancellationReason?: string
  confirmedBy?: Types.ObjectId | string
  confirmedAt?: Date
  completedAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export interface DonationSlot {
  _id?: Types.ObjectId | string
  slotDate: string
  timeSlot: string
  maxCapacity: number
  bookedCount: number
  status: 'Open' | 'Full' | 'Closed'
  createdAt?: Date
  updatedAt?: Date
}

export type NotificationType =
  | 'RequestSubmitted'
  | 'RequestApproved'
  | 'RequestRejected'
  | 'RequestCancelled'
  | 'BloodIssued'
  | 'IssuanceCancelled'
  | 'LowStockAlert'
  | 'AppointmentUpdate'
  | 'General'

export type NotificationPriority = 'Normal' | 'High' | 'Emergency'

export type NotificationReferenceType =
  | 'BloodRequest'
  | 'BloodIssuance'
  | 'Donation'
  | 'Appointment'
  | 'BloodStock'
  | 'General'

export interface Notification {
  _id?: Types.ObjectId | string
  recipientId: Types.ObjectId | string
  recipientRole?: UserRole
  type: NotificationType
  title: string
  message: string
  referenceId?: Types.ObjectId | string
  referenceType?: NotificationReferenceType
  priority?: NotificationPriority
  isRead: boolean
  readAt?: Date | null
  eventKey: string
  createdAt?: Date
  updatedAt?: Date
}

export interface AuthToken {
  userId: string
  email: string
  role: string
  iat?: number
  exp?: number
  credentialVersion?: number
}

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

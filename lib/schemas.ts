import mongoose from 'mongoose'
import type {
  User,
  BloodStock,
  BloodRequest,
  Donation,
  Appointment,
  DonationSlot,
  BloodIssuance,
  InventoryLedger,
  Notification,
} from './types'

const userSchema = new mongoose.Schema<User>(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: 6,
      select: false,
    },
    role: {
      type: String,
      enum: ['Admin', 'Donor', 'Hospital'],
      default: 'Donor',
      required: [true, 'Please specify a role'],
    },
    credentialVersion: {
      type: Number,
      default: 0,
      min: 0,
  },
    bloodGroup: {
      type: String,
      enum: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
    },
    phone: String,
    hospitalName: String,
  },
  {
    timestamps: true,
  }
)

const bloodStockSchema = new mongoose.Schema<BloodStock>(
  {
    bloodGroup: {
      type: String,
      enum: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
      unique: true,
      required: true,
    },
    unitsAvailable: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
)

const bloodRequestSchema = new mongoose.Schema<BloodRequest>(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    hospitalName: {
      type: String,
      required: true,
      trim: true,
    },
    bloodGroup: {
      type: String,
      enum: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
      required: true,
      index: true,
    },
    unitsRequired: {
      type: Number,
      required: [true, 'Please specify units required'],
      min: 1,
    },
    unitsIssued: {
      type: Number,
      default: 0,
      min: 0,
    },
    priority: {
      type: String,
      enum: ['Normal', 'Emergency'],
      default: 'Normal',
      index: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Partially Issued', 'Issued', 'Rejected', 'Cancelled'],
      default: 'Pending',
      index: true,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    requestDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    approvedDate: Date,
    statusHistory: [
      {
        status: {
          type: String,
          enum: ['Pending', 'Approved', 'Partially Issued', 'Issued', 'Rejected', 'Cancelled'],
          required: true,
        },
        changedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        changedByName: {
          type: String,
          required: true,
        },
        changedByRole: {
          type: String,
          enum: ['Admin', 'Donor', 'Hospital'],
          required: true,
        },
        changedAt: {
          type: Date,
          default: Date.now,
        },
        reason: String,
        notes: String,
      },
    ],
  },
  {
    timestamps: true,
  }
)

bloodRequestSchema.index({ hospitalId: 1, status: 1 })
bloodRequestSchema.index({ bloodGroup: 1, status: 1 })
bloodRequestSchema.index({ priority: 1, createdAt: -1 })

export const UserModel = mongoose.models.User || mongoose.model('User', userSchema)
export const BloodStockModel =
  mongoose.models.BloodStock || mongoose.model('BloodStock', bloodStockSchema)
export const BloodRequestModel =
  mongoose.models.BloodRequest || mongoose.model('BloodRequest', bloodRequestSchema)

const donationSchema = new mongoose.Schema<Donation>(
  {
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Donor ID is required'],
      index: true,
    },
    donorName: {
      type: String,
      required: [true, 'Donor name is required'],
      trim: true,
    },
    donorEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },
    bloodGroup: {
      type: String,
      enum: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
      required: [true, 'Blood group is required'],
    },
    units: {
      type: Number,
      required: [true, 'Units collected is required'],
      min: [1, 'Must collect at least 1 unit'],
      max: [2, 'Single donation cannot exceed 2 units'],
      default: 1,
    },
    donationDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Cancelled'],
      default: 'Completed',
      index: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Admin ID is required'],
    },
    adminName: {
      type: String,
      required: [true, 'Admin name is required'],
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    stockCredited: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

export const DonationModel =
  mongoose.models.Donation || mongoose.model('Donation', donationSchema)

const appointmentSchema = new mongoose.Schema<Appointment>(
  {
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Donor ID is required'],
      index: true,
    },
    donorName: {
      type: String,
      required: true,
      trim: true,
    },
    donorEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    donorPhone: String,
    bloodGroup: {
      type: String,
      enum: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
    },
    slotDate: {
      type: String,
      required: [true, 'Slot date is required (YYYY-MM-DD)'],
      index: true,
    },
    timeSlot: {
      type: String,
      required: [true, 'Time slot is required'],
      index: true,
    },
    status: {
      type: String,
      enum: ['Scheduled', 'Confirmed', 'Completed', 'Cancelled'],
      default: 'Scheduled',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
    },
    cancellationReason: {
      type: String,
      trim: true,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    confirmedAt: Date,
    completedAt: Date,
  },
  {
    timestamps: true,
  }
)

appointmentSchema.index({ donorId: 1, slotDate: 1, status: 1 })
appointmentSchema.index({ slotDate: 1, timeSlot: 1, status: 1 })

export const AppointmentModel =
  mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema)

const donationSlotSchema = new mongoose.Schema<DonationSlot>(
  {
    slotDate: {
      type: String,
      required: true,
      index: true,
    },
    timeSlot: {
      type: String,
      required: true,
      index: true,
    },
    maxCapacity: {
      type: Number,
      required: true,
      default: 4,
      min: 1,
    },
    bookedCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['Open', 'Full', 'Closed'],
      default: 'Open',
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

donationSlotSchema.index({ slotDate: 1, timeSlot: 1 }, { unique: true })

export const DonationSlotModel =
  mongoose.models.DonationSlot || mongoose.model('DonationSlot', donationSlotSchema)

const bloodIssuanceSchema = new mongoose.Schema<BloodIssuance>(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BloodRequest',
      required: [true, 'Reference request ID is required'],
      index: true,
    },
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Hospital ID is required'],
      index: true,
    },
    hospitalName: {
      type: String,
      required: true,
      trim: true,
    },
    bloodGroup: {
      type: String,
      enum: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity issued is required'],
      min: [1, 'Must issue at least 1 unit'],
    },
    issueDate: {
      type: Date,
      default: Date.now,
      index: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Issuing administrator ID is required'],
    },
    adminName: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Issued', 'Cancelled'],
      default: 'Issued',
      index: true,
    },
    recipientNotes: {
      type: String,
      trim: true,
    },
    clinicalReviewNotice: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
)

bloodIssuanceSchema.index({ requestId: 1, createdAt: -1 })
bloodIssuanceSchema.index({ hospitalId: 1, createdAt: -1 })

export const BloodIssuanceModel =
  mongoose.models.BloodIssuance || mongoose.model('BloodIssuance', bloodIssuanceSchema)

const inventoryLedgerSchema = new mongoose.Schema<InventoryLedger>(
  {
    bloodGroup: {
      type: String,
      enum: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
      required: true,
      index: true,
    },
    movementType: {
      type: String,
      enum: ['Credit', 'Deduction'],
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    reason: {
      type: String,
      enum: [
        'Donation Credit',
        'Hospital Issuance',
        'Administrative Correction',
        'Discard / Expired',
        'Issuance Cancellation / Return',
      ],
      required: true,
      index: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    referenceType: {
      type: String,
      enum: ['Donation', 'BloodIssuance', 'BloodRequest', 'ManualAdjustment'],
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    performedByName: {
      type: String,
      required: true,
      trim: true,
    },
    performedByRole: {
      type: String,
      enum: ['Admin', 'Donor', 'Hospital'],
      required: true,
    },
    previousBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    newBalance: {
      type: Number,
      required: true,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
)

inventoryLedgerSchema.index({ bloodGroup: 1, timestamp: -1 })
inventoryLedgerSchema.index({ movementType: 1, timestamp: -1 })
inventoryLedgerSchema.index({ reason: 1, timestamp: -1 })

export const InventoryLedgerModel =
  mongoose.models.InventoryLedger || mongoose.model('InventoryLedger', inventoryLedgerSchema)

const notificationSchema = new mongoose.Schema<Notification>(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    recipientRole: {
      type: String,
      enum: ['Admin', 'Donor', 'Hospital'],
    },
    type: {
      type: String,
      enum: [
        'RequestSubmitted',
        'RequestApproved',
        'RequestRejected',
        'RequestCancelled',
        'BloodIssued',
        'IssuanceCancelled',
        'LowStockAlert',
        'AppointmentUpdate',
        'General',
      ],
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    referenceType: {
      type: String,
      enum: [
        'BloodRequest',
        'BloodIssuance',
        'Donation',
        'Appointment',
        'BloodStock',
        'General',
      ],
    },
    priority: {
      type: String,
      enum: ['Normal', 'High', 'Emergency'],
      default: 'Normal',
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
      default: null,
    },
    eventKey: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
)

notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 })
notificationSchema.index({ recipientId: 1, eventKey: 1 }, { unique: true })

export const NotificationModel =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema)



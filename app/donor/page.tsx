'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PortalHeader } from '@/components/portal-header'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  LogOut,
  Droplets,
  Heart,
  Calendar,
  ShieldAlert,
  CheckCircle,
  Clock,
  XCircle,
  Sparkles,
  RefreshCw,
  Plus,
  AlertCircle,
  Check,
  X,
} from 'lucide-react'
import type { DonorStats, Donation, Appointment } from '@/lib/types'

interface SlotOption {
  timeSlot: string
  maxCapacity: number
  bookedCount: number
  remainingCapacity: number
  isAvailable: boolean
  status: string
}

export default function DonorDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<DonorStats | null>(null)
  const [donations, setDonations] = useState<Donation[]>([])
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshingDonations, setRefreshingDonations] = useState(false)
  const [donationError, setDonationError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Booking Modal State
  const [isBookingOpen, setIsBookingOpen] = useState(false)
  const [bookingDate, setBookingDate] = useState(() => {
    // Default to tomorrow
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [availableSlots, setAvailableSlots] = useState<SlotOption[]>([])
  const [selectedSlot, setSelectedSlot] = useState('')
  const [bookingNotes, setBookingNotes] = useState('')
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [bookingError, setBookingError] = useState<string | null>(null)

  // Cancelling appointment state
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    setDonationError(null)
    try {
      // 1. Verify Donor authentication
      const userRes = await fetch('/api/auth/me')
      if (!userRes.ok) {
        router.push('/')
        return
      }
      const userData = await userRes.json()

      if (userData.data?.role !== 'Donor') {
        router.push('/')
        return
      }

      setUser(userData.data)

      // 2. Fetch donor stats
      const statsRes = await fetch('/api/donor/stats')
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData.data)
      }

      // 3. Fetch donation history
      const donationsRes = await fetch('/api/donations')
      if (donationsRes.ok) {
        const donationsData = await donationsRes.json()
        setDonations(donationsData.data || [])
        setDonationError(null)
      } else {
        const errJson = await donationsRes.json().catch(() => ({}))
        setDonationError(errJson.error || 'Failed to retrieve donation history.')
      }

      // 4. Fetch donor's own appointments
      const apptsRes = await fetch('/api/appointments')
      if (apptsRes.ok) {
        const apptsData = await apptsRes.json()
        setAppointments(apptsData.data || [])
      }
    } catch (err: any) {
      console.error('[donor] Error loading dashboard:', err)
      setError(err.message || 'Failed to load donor data')
    } finally {
      setLoading(false)
    }
  }, [router])


  // Local inline refresh for donation history & stats
  const handleRefreshDonations = async () => {
    setRefreshingDonations(true)
    setDonationError(null)
    try {
      const [donationsRes, statsRes] = await Promise.all([
        fetch('/api/donations'),
        fetch('/api/donor/stats'),
      ])
      if (donationsRes.ok) {
        const donationsData = await donationsRes.json()
        setDonations(donationsData.data || [])
      } else {
        const errJson = await donationsRes.json().catch(() => ({}))
        setDonationError(errJson.error || 'Failed to refresh donation records.')
      }
      if (statsRes.ok) {
        const statsData = await statsRes.json()
        setStats(statsData.data)
      }
    } catch (err: any) {
      console.error('[donor] Error refreshing donations:', err)
      setDonationError('Network error refreshing donation history.')
    } finally {
      setRefreshingDonations(false)
    }
  }

useEffect(() => {
  const timer = window.setTimeout(() => {
    void fetchData()
  }, 0)

  return () => window.clearTimeout(timer)
}, [fetchData])

  // Fetch available slots when bookingDate changes
  const fetchSlotsForDate = async (dateStr: string) => {
    setSlotsLoading(true)
    setBookingError(null)
    setSelectedSlot('')
    try {
      const res = await fetch(`/api/appointments/slots?date=${dateStr}`)
      const data = await res.json()
      if (res.ok) {
        setAvailableSlots(data.data || [])
      } else {
        setBookingError(data.error || 'Failed to fetch slots for this date')
      }
    } catch {
      setBookingError('Network error checking slot availability.')
    } finally {
      setSlotsLoading(false)
    }
  }

  // Open booking modal
  const handleOpenBooking = () => {
    setBookingError(null)
    setIsBookingOpen(true)
    fetchSlotsForDate(bookingDate)
  }

  // Submit appointment booking
  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedSlot) {
      setBookingError('Please choose an available time slot.')
      return
    }

    setBookingSubmitting(true)
    setBookingError(null)

    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slotDate: bookingDate,
          timeSlot: selectedSlot,
          notes: bookingNotes,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setAppointments((prev) => [...prev, data.data])
        setActionMessage({
          type: 'success',
          text: `Appointment scheduled for ${bookingDate} at ${selectedSlot}. An administrator will confirm your booking.`,
        })
        setIsBookingOpen(false)
        setSelectedSlot('')
        setBookingNotes('')
      } else {
        setBookingError(data.error || 'Failed to book appointment.')
      }
    } catch {
      setBookingError('Network error during appointment booking.')
    } finally {
      setBookingSubmitting(false)
    }
  }

  // Cancel appointment
  const handleCancelAppointment = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this scheduled appointment?')) return

    setCancellingId(id)
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Cancelled',
          cancellationReason: 'Cancelled by donor through portal',
        }),
      })

      const data = await res.json()

      if (res.ok) {
        setAppointments((prev) =>
          prev.map((a) => (a._id === id ? { ...a, status: 'Cancelled' } : a))
        )
        setActionMessage({
          type: 'success',
          text: 'Appointment cancelled and the slot has been released.',
        })
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to cancel appointment.' })
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Network error cancelling appointment.' })
    } finally {
      setCancellingId(null)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
    } catch (error) {
      console.error('[donor] Logout error:', error)
    }
  }

  const getAppointmentStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 gap-1 text-xs">
            <Check className="h-3 w-3" /> Attended
          </Badge>
        )
      case 'Confirmed':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 gap-1 text-xs">
            <CheckCircle className="h-3 w-3" /> Confirmed
          </Badge>
        )
      case 'Scheduled':
        return (
          <Badge className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800 gap-1 text-xs">
            <Clock className="h-3 w-3" /> Scheduled
          </Badge>
        )
      case 'Cancelled':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800 gap-1 text-xs">
            <XCircle className="h-3 w-3" /> Cancelled
          </Badge>
        )
      default:
        return <Badge variant="outline" className="dark:border-slate-700 dark:text-slate-300">{status}</Badge>
    }
  }

  const getDonationStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return (
          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 gap-1 text-xs">
            <CheckCircle className="h-3 w-3" /> Verified Bleed
          </Badge>
        )
      case 'Pending':
        return (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800 gap-1 text-xs">
            <Clock className="h-3 w-3" /> Pending Lab Verification
          </Badge>
        )
      case 'Cancelled':
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800 gap-1 text-xs">
            <XCircle className="h-3 w-3" /> Cancelled
          </Badge>
        )
      default:
        return <Badge variant="outline" className="dark:border-slate-700 dark:text-slate-300">{status}</Badge>
    }
  }

  // Active appointments (Scheduled or Confirmed), nearest upcoming slot first
  const activeAppointments = useMemo(() => {
    return [...appointments]
      .filter((a) => a.status === 'Scheduled' || a.status === 'Confirmed')
      .sort((a, b) => {
        // Nearest upcoming slotDate first
        const dateCmp = a.slotDate.localeCompare(b.slotDate)
        if (dateCmp !== 0) return dateCmp

        // Earlier timeSlot first
        const timeCmp = a.timeSlot.localeCompare(b.timeSlot)
        if (timeCmp !== 0) return timeCmp

        return String(a._id || '').localeCompare(String(b._id || ''))
      })
  }, [appointments])

  // Past appointments (Completed or Cancelled), latest booked appointment first
  const pastAppointments = useMemo(() => {
    return [...appointments]
      .filter((a) => a.status === 'Completed' || a.status === 'Cancelled')
      .sort((a, b) => {
        // 1. Primary sort: Booked slotDate descending (latest appointment first)
        const dateCmp = b.slotDate.localeCompare(a.slotDate)
        if (dateCmp !== 0) return dateCmp

        // 2. Secondary sort: Booked timeSlot descending (e.g. '15:00 - 16:00' before '10:00 - 11:00')
        const timeCmp = b.timeSlot.localeCompare(a.timeSlot)
        if (timeCmp !== 0) return timeCmp

        // 3. Deterministic tertiary sort: creation timestamp descending
        const createdA = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const createdB = b.createdAt ? new Date(b.createdAt).getTime() : 0
        if (createdB !== createdA) return createdB - createdA

        // 4. Deterministic fallback: _id descending
        return String(b._id || '').localeCompare(String(a._id || ''))
      })
  }, [appointments])

  // Verified donations, newest recorded donation date/time first
  const sortedDonations = useMemo(() => {
    return [...donations].sort((a, b) => {
      const timeA = a.donationDate ? new Date(a.donationDate).getTime() : 0
      const timeB = b.donationDate ? new Date(b.donationDate).getTime() : 0
      if (timeB !== timeA) return timeB - timeA

      return String(b._id || '').localeCompare(String(a._id || ''))
    })
  }, [donations])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 transition-colors">
        <div className="text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-red-600 border-r-transparent" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading your donor profile...</p>
        </div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 p-4 transition-colors">
        <div className="max-w-md rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm text-center space-y-4">
          <p className="text-sm text-red-600 dark:text-red-400 font-medium">{error || 'Session could not be verified'}</p>
          <Button onClick={fetchData} className="gap-2 cursor-pointer">
            <RefreshCw className="h-4 w-4" /> Try Again
          </Button>
        </div>
      </div>
    )
  }

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <PortalHeader
        portalName="Donor Life Center"
        userName={user.name}
        userSubtitle={user.bloodGroup ? `Blood Group: ${user.bloodGroup}` : 'Registered Donor'}
        roleBadgeText="Donor"
        onLogout={handleLogout}
      />

      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8">
        {/* Welcome Banner with Action Button */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
              Welcome, {user.name}!
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
              Thank you for being a registered blood donor. Your contributions save lives.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800 px-3 py-1 text-xs font-bold">
              <Droplets className="h-3.5 w-3.5" /> Blood Group: {user.bloodGroup || 'Not specified'}
            </span>
            <Button
              onClick={handleOpenBooking}
              className="bg-red-600 hover:bg-red-700 text-white gap-1.5 text-xs shadow-xs cursor-pointer"
            >
              <Calendar className="h-4 w-4" /> Book Appointment
            </Button>
          </div>
        </div>

        {/* Action Message Alert */}
        {actionMessage && (
          <div
            className={`flex items-center gap-2 rounded-lg p-4 text-xs shadow-sm transition-all animate-in fade-in-50 ${
              actionMessage.type === 'success'
                ? 'border border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/60 dark:text-green-300'
                : 'border border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300'
            }`}
          >
            {actionMessage.type === 'success' ? (
              <Check className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            )}
            <span className="flex-1">{actionMessage.text}</span>
            <button
              onClick={() => setActionMessage(null)}
              className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Real Dynamic Metrics Cards */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Profile Summary */}
          <Card className="shadow-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Donor Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Full Name</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{user.name}</p>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800">
                <div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Blood Type</p>
                  <p className="text-base font-extrabold text-red-600 dark:text-red-400">{user.bloodGroup || 'N/A'}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">Registered</p>
                  <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Active'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card 2: Real Completed Donations */}
          <Card className="shadow-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Total Donations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <p className="text-3xl font-extrabold text-slate-900 dark:text-slate-100">
                  {stats?.completedDonations ?? 0}
                </p>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {stats?.totalUnitsDonated ?? 0} unit(s)
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Verified completed bleeds</p>
            </CardContent>
          </Card>

          {/* Card 3: Real Calculated Impact */}
          <Card className="shadow-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Heart className="h-3.5 w-3.5 text-red-500 dark:text-red-400" />
                Community Impact
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline justify-between">
                <p className="text-3xl font-extrabold text-red-600 dark:text-red-400">
                  {stats?.livesSavedEstimate ?? 0}
                </p>
                <Sparkles className="h-5 w-5 text-amber-500 dark:text-amber-400" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Lives potentially saved (est.)</p>
            </CardContent>
          </Card>

          {/* Card 4: Estimated Next Eligibility */}
          <Card className="shadow-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-blue-500 dark:text-blue-400" />
                Eligibility Estimate
              </CardTitle>
            </CardHeader>
            <CardContent>
              {stats?.isEligibleEstimate ? (
                <div>
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 font-semibold text-xs">
                    Eligible to Donate
                  </Badge>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                    {stats.lastDonationDate
                      ? `Last donation: ${new Date(stats.lastDonationDate).toLocaleDateString()}`
                      : 'Ready for first donation'}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-base font-bold text-amber-700 dark:text-amber-400">
                    in ~{stats?.daysRemainingEstimate} days
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Est. date:{' '}
                    {stats?.nextEligibleDateEstimate
                      ? new Date(stats.nextEligibleDateEstimate).toLocaleDateString()
                      : 'Pending'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Mandatory Medical Screening Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/80 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200 p-4 text-xs shadow-xs">
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="font-bold text-amber-800 dark:text-amber-300">
              Medical Screening &amp; Safety Disclaimer
            </p>
            <p className="text-amber-800/90 dark:text-amber-200/90 leading-relaxed">
              Donation eligibility dates are mathematical estimates calculated using a standard
              90-day whole blood recovery interval. Actual medical eligibility cannot be granted
              by this application alone. All prospective donors must complete in-person hemoglobin
              testing, blood pressure &amp; pulse vitals screening, and medical health evaluation
              conducted by certified healthcare professionals on-site before every donation.
            </p>
          </div>
        </div>

        {/* Active Appointments Card */}
        <Card className="rounded-xl shadow-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" /> Your Scheduled Appointments
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                  Active donation bookings at the blood center
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={handleOpenBooking}
                className="gap-1.5 text-xs cursor-pointer rounded-xl"
              >
                <Plus className="h-3.5 w-3.5" /> Book Another Slot
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeAppointments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center space-y-2">
                <Calendar className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No active appointments scheduled</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Choose a convenient time slot and book your next whole blood donation.
                </p>
                <Button size="sm" onClick={handleOpenBooking} className="mt-2 text-xs bg-red-600 hover:bg-red-700 text-white cursor-pointer rounded-xl">
                  Choose Appointment Date
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeAppointments.map((appt, index) => (
                  <div
                    key={appt._id?.toString() ?? `${appt.slotDate}-${appt.timeSlot}-${index}`}                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                          {appt.slotDate}
                        </span>
                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 dark:text-blue-300 dark:bg-blue-950/60 dark:border-blue-800 px-2 py-0.5 rounded-md">
                          {appt.timeSlot}
                        </span>
                        {getAppointmentStatusBadge(appt.status)}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Location: Central Blood Bank Center • Blood Type: {appt.bloodGroup || user.bloodGroup}
                      </p>
                      {appt.notes && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 italic">Notes: {appt.notes}</p>
                      )}
                    </div>

                    <div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleCancelAppointment(appt._id ? appt._id.toString() : '')
                        }
                        disabled={cancellingId === appt._id?.toString()}
                        className="text-xs h-8 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-900/60 dark:hover:bg-red-950/50 cursor-pointer rounded-xl"
                      >
                        {cancellingId === appt._id?.toString()
                          ? 'Cancelling...'
                          : 'Cancel Appointment'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Past Appointments History Card */}
        <Card className="rounded-xl shadow-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-slate-600 dark:text-slate-400" /> Past Appointments &amp; Attendance History
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                  Record of your completed attendances and cancelled bookings
                </CardDescription>
              </div>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {pastAppointments.length} record{pastAppointments.length === 1 ? '' : 's'}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {pastAppointments.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-6 text-center space-y-2">
                <Clock className="mx-auto h-7 w-7 text-slate-300 dark:text-slate-600" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">No past appointment records</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Completed attendances and cancelled appointments will appear here for your reference.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <Table className="min-w-[680px]">
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60">
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200 w-44">Booked Slot</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200 w-36">Status</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Attendance / Resolution Details</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pastAppointments.map((appt, index) => (
                        <TableRow key={appt._id?.toString() ?? `${appt.slotDate}-${appt.timeSlot}-${index}`} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">                        <TableCell className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                          <span>{appt.slotDate}</span>
                          <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                            {appt.timeSlot}
                          </span>
                        </TableCell>
                        <TableCell>
                          {getAppointmentStatusBadge(appt.status)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 dark:text-slate-300">
                          {appt.status === 'Completed' ? (
                            <div className="space-y-0.5">
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                <Check className="h-3.5 w-3.5 shrink-0" /> Attendance Completed
                              </span>
                              {appt.completedAt ? (
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400 pl-4.5">
                                  Logged:{' '}
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {new Date(appt.completedAt).toLocaleDateString(undefined, {
                                      year: 'numeric',
                                      month: 'short',
                                      day: 'numeric',
                                    })}
                                  </span>{' '}
                                  at{' '}
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {new Date(appt.completedAt).toLocaleTimeString(undefined, {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </span>
                              ) : (
                                <span className="block text-[11px] text-slate-500 dark:text-slate-400 pl-4.5 italic">
                                  Attendance verified by staff
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="text-red-700 dark:text-red-400 font-medium italic">
                                Reason: {appt.cancellationReason || 'Cancelled'}
                              </span>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 dark:text-slate-400 italic">
                          {appt.notes || '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Real Donation History Table */}
        <Card className="rounded-xl shadow-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Droplets className="h-5 w-5 text-red-600 dark:text-red-400" />
                  Your Verified Donation History
                </CardTitle>
                <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                  Official clinical bleed records verified and logged by blood bank staff
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefreshDonations}
                disabled={refreshingDonations}
                className="gap-1.5 text-xs cursor-pointer text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-xl"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshingDonations ? 'animate-spin' : ''}`} />
                {refreshingDonations ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {donationError && (
              <div className="mb-4 flex items-center justify-between gap-2 rounded-xl p-3.5 text-xs border border-red-200 bg-red-50 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                  <span>{donationError}</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRefreshDonations}
                  className="h-7 text-xs border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 cursor-pointer rounded-lg"
                >
                  Retry
                </Button>
              </div>
            )}

            {sortedDonations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center space-y-2.5">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 dark:bg-red-950/60 text-red-600 dark:text-red-400">
                  <Droplets className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No verified blood donations recorded yet</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  When you attend a physical bleeding session at the donor center, medical staff perform laboratory screening and log your official donation units into the blood inventory. Verified donations will be recorded here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60">
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Donation Date &amp; Time</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Blood Group</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Units</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Status</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Recorded By</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Reference / Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedDonations.map((d, index) => (
                        <TableRow key={d._id?.toString() ?? `${d.donationDate}-${d.donorName}-${index}`} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">                        <TableCell className="font-medium text-slate-900 dark:text-slate-100 text-xs">
                          {d.donationDate ? (
                            <div>
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {new Date(d.donationDate).toLocaleDateString(undefined, {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </span>
                              <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                {new Date(d.donationDate).toLocaleTimeString(undefined, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          ) : (
                            'N/A'
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center font-bold text-red-700 bg-red-50 border border-red-200 dark:text-red-300 dark:bg-red-950/60 dark:border-red-800 px-2.5 py-0.5 rounded-md text-xs">
                            {d.bloodGroup}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {d.units} {d.units === 1 ? 'unit' : 'units'}
                        </TableCell>
                        <TableCell>{getDonationStatusBadge(d.status)}</TableCell>
                        <TableCell className="text-xs text-slate-600 dark:text-slate-300">{d.adminName || 'Staff Administrator'}</TableCell>
                        <TableCell className="text-xs text-slate-500 dark:text-slate-400 italic">
                          {d.notes || 'Routine whole blood donation'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Educational Content */}
        <Card className="shadow-xs border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardHeader>
            <CardTitle className="text-base text-slate-900 dark:text-slate-100">About Whole Blood Donation</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
            <p>
              Blood donation is a safe, vital contribution to community healthcare. Whole blood is
              frequently separated into red blood cells, plasma, and platelets to help multiple
              patients undergoing surgical procedures, trauma care, and cancer treatments.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-2.5 border border-slate-100 dark:border-slate-800">
                <p className="font-bold text-slate-800 dark:text-slate-100 mb-0.5">Pre-Donation Guidelines:</p>
                <p className="text-slate-600 dark:text-slate-300">Drink plenty of water, eat a healthy iron-rich meal, and bring a valid photo ID.</p>
              </div>
              <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-2.5 border border-slate-100 dark:border-slate-800">
                <p className="font-bold text-slate-800 dark:text-slate-100 mb-0.5">Post-Donation Rest:</p>
                <p className="text-slate-600 dark:text-slate-300">Rest for 10-15 minutes, hydrate well, and avoid strenuous physical activity for 24 hours.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Book Appointment Modal Dialog */}
      <Dialog open={isBookingOpen} onOpenChange={setIsBookingOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Calendar className="h-5 w-5 text-red-600 dark:text-red-400" /> Book Donation Slot
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Select your preferred appointment date and time window. Slots are enforced with live capacity limits.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleBookAppointment} className="space-y-4 py-2">
            {bookingError && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/60 p-2.5 text-xs text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{bookingError}</span>
              </div>
            )}

            {/* Date Selection */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Select Date:
              </label>
              <Input
                type="date"
                min={todayStr}
                value={bookingDate}
                onChange={(e) => {
                  setBookingDate(e.target.value)
                  fetchSlotsForDate(e.target.value)
                }}
                className="h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Time Slot Selection Cards */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                Choose Time Window:
              </label>

              {slotsLoading ? (
                <div className="py-6 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-red-600 border-r-transparent" />
                  <p>Checking slot capacity...</p>
                </div>
              ) : availableSlots.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                  Select a valid future date to view available appointment slots.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {availableSlots.map((slot) => {
                    const isSelected = selectedSlot === slot.timeSlot
                    const isAvailable = slot.isAvailable

                    return (
                      <button
                        key={slot.timeSlot}
                        type="button"
                        disabled={!isAvailable}
                        onClick={() => setSelectedSlot(slot.timeSlot)}
                        className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'border-red-600 bg-red-50 dark:bg-red-950/60 ring-1 ring-red-600'
                            : isAvailable
                              ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/60'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800/40 opacity-60 cursor-not-allowed'
                        }`}
                      >
                        <p
                          className={`text-xs font-bold ${
                            isSelected ? 'text-red-700 dark:text-red-300' : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {slot.timeSlot}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {isAvailable ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              {slot.remainingCapacity} seats left
                            </span>
                          ) : (
                            <span className="text-red-600 dark:text-red-400 font-semibold">Fully booked</span>
                          )}
                        </p>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Special Remarks / Notes (Optional):
              </label>
              <Textarea
                placeholder="First time donor, specific health remark, etc."
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                rows={2}
                className="text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsBookingOpen(false)}
                disabled={bookingSubmitting}
                className="text-xs cursor-pointer"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={bookingSubmitting || !selectedSlot}
                className="bg-red-600 hover:bg-red-700 text-white text-xs gap-1.5 cursor-pointer"
              >
                {bookingSubmitting ? 'Reserving Seat...' : 'Confirm Appointment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  )
}

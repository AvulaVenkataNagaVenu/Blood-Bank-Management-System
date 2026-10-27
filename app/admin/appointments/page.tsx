'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/admin/dashboard-header'
import { Sidebar } from '@/components/admin/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Calendar,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Check,
  X,
  RotateCcw,
  Heart,
} from 'lucide-react'
import type { Appointment } from '@/lib/types'

export default function AdminAppointmentsPage() {
  const router = useRouter()
  const [adminUser, setAdminUser] = useState<any>(null)
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Filters
  const [statusFilter, setStatusFilter] = useState('All')
  const [dateFilter, setDateFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  // Cancel Dialog Modal
  const [cancellingAppt, setCancellingAppt] = useState<Appointment | null>(null)
  const [cancelReason, setCancelReason] = useState('Cancelled by donor center')

  const fetchAppointments = useCallback(async () => {
      try {
      const userRes = await fetch('/api/auth/me')
      if (!userRes.ok) {
        router.push('/')
        return
      }
      const userData = await userRes.json()

      if (userData.data?.role !== 'Admin') {
        router.push('/')
        return
      }

      setAdminUser(userData.data)

      const apptsRes = await fetch('/api/appointments')
      if (apptsRes.ok) {
        const apptsData = await apptsRes.json()
        setAppointments(apptsData.data || [])
      }
    } catch (error) {
      console.error('[appointments] Error fetching appointments:', error)
      setMessage({ type: 'error', text: 'Failed to load appointment schedule.' })
    } finally {
      setLoading(false)
    }
  }, [router])

useEffect(() => {
  const timer = window.setTimeout(() => {
    void fetchAppointments()
  }, 0)

  return () => window.clearTimeout(timer)
}, [fetchAppointments])

  // Status Action Handler: Confirm
  const handleConfirm = async (id: string) => {
    setUpdatingId(id)
    setMessage(null)
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Confirmed' }),
      })
      const data = await res.json()
      if (res.ok) {
        setAppointments((prev) =>
          prev.map((a) => (a._id === id ? { ...a, status: 'Confirmed' } : a))
        )
        setMessage({ type: 'success', text: 'Appointment confirmed.' })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to confirm appointment.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Server connection error.' })
    } finally {
      setUpdatingId(null)
    }
  }

  // Status Action Handler: Complete
  const handleComplete = async (id: string) => {
    setUpdatingId(id)
    setMessage(null)
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed' }),
      })
      const data = await res.json()
      if (res.ok) {
        setAppointments((prev) =>
          prev.map((a) => (a._id === id ? { ...a, status: 'Completed' } : a))
        )
        setMessage({
          type: 'success',
          text: 'Appointment marked as completed. You can now record the blood donation to credit stock.',
        })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to complete appointment.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Server connection error.' })
    } finally {
      setUpdatingId(null)
    }
  }

  // Status Action Handler: Cancel
  const handleConfirmCancel = async () => {
    if (!cancellingAppt || !cancellingAppt._id) return

    setUpdatingId(cancellingAppt._id.toString())
    try {
      const res = await fetch(`/api/appointments/${cancellingAppt._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Cancelled',
          cancellationReason: cancelReason.trim(),
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setAppointments((prev) =>
          prev.map((a) =>
            a._id === cancellingAppt._id
              ? { ...a, status: 'Cancelled', cancellationReason: cancelReason.trim() }
              : a
          )
        )
        setMessage({ type: 'success', text: 'Appointment cancelled and slot capacity released.' })
        setCancellingAppt(null)
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to cancel appointment.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Server connection error.' })
    } finally {
      setUpdatingId(null)
    }
  }

  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      if (statusFilter !== 'All' && a.status !== statusFilter) return false
      if (dateFilter && a.slotDate !== dateFilter) return false
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim()
        const matchName = a.donorName.toLowerCase().includes(query)
        const matchEmail = (a.donorEmail || '').toLowerCase().includes(query)
        const matchTime = a.timeSlot.toLowerCase().includes(query)
        return matchName || matchEmail || matchTime
      }
      return true
    })
  }, [appointments, statusFilter, dateFilter, searchTerm])

  const statusCounts = useMemo(() => {
    return {
      all: appointments.length,
      scheduled: appointments.filter((a) => a.status === 'Scheduled').length,
      confirmed: appointments.filter((a) => a.status === 'Confirmed').length,
      completed: appointments.filter((a) => a.status === 'Completed').length,
      cancelled: appointments.filter((a) => a.status === 'Cancelled').length,
    }
  }, [appointments])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Confirmed':
        return (
          <Badge className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 gap-1 text-xs">
            <CheckCircle className="h-3 w-3" /> Confirmed
          </Badge>
        )
      case 'Scheduled':
        return (
          <Badge className="bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800 gap-1 text-xs">
            <Clock className="h-3 w-3" /> Scheduled
          </Badge>
        )
      case 'Completed':
        return (
          <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700 gap-1 text-xs">
            <Check className="h-3 w-3" /> Attended
          </Badge>
        )
      case 'Cancelled':
        return (
          <Badge className="bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800 gap-1 text-xs">
            <XCircle className="h-3 w-3" /> Cancelled
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-red-600 border-r-transparent" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading appointment schedule...</p>
        </div>
      </div>
    )
  }

  if (!adminUser) return null

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader
          userName={adminUser.name}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1600px] space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Donor Appointment Schedule</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Manage appointment bookings, review attendance, and release cancelled slots
              </p>
            </div>

            {/* Notification */}
            {message && (
              <div
                className={`flex items-center gap-2 rounded-xl p-4 text-sm shadow-xs transition-all ${
                  message.type === 'success'
                    ? 'border border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200'
                    : 'border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200'
                }`}
              >
                {message.type === 'success' ? (
                  <Check className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
                ) : (
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                )}
                <span className="flex-1">{message.text}</span>
                <button onClick={() => setMessage(null)} className="rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/5">
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>
            )}

            {/* Status Tabs with Horizontal Scroll */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setStatusFilter('All')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'All'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                All Bookings
                <span className="rounded-full bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.2 text-[10px]">
                  {statusCounts.all}
                </span>
              </button>

              <button
                onClick={() => setStatusFilter('Scheduled')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'Scheduled'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                Scheduled
                <span className="rounded-full bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 px-1.5 py-0.2 text-[10px]">
                  {statusCounts.scheduled}
                </span>
              </button>

              <button
                onClick={() => setStatusFilter('Confirmed')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'Confirmed'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                Confirmed
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.2 text-[10px]">
                  {statusCounts.confirmed}
                </span>
              </button>

              <button
                onClick={() => setStatusFilter('Completed')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'Completed'
                    ? 'bg-slate-700 dark:bg-slate-300 text-white dark:text-slate-900 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                Attended
                <span className="rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1.5 py-0.2 text-[10px]">
                  {statusCounts.completed}
                </span>
              </button>

              <button
                onClick={() => setStatusFilter('Cancelled')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'Cancelled'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                Cancelled
                <span className="rounded-full bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300 px-1.5 py-0.2 text-[10px]">
                  {statusCounts.cancelled}
                </span>
              </button>
            </div>

            {/* Filter Controls */}
            <div className="grid gap-3 sm:grid-cols-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search donor name or time slot..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <Input
                  type="date"
                  placeholder="Filter by date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex items-center justify-end">
                {searchTerm || dateFilter || statusFilter !== 'All' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchTerm('')
                      setDateFilter('')
                      setStatusFilter('All')
                    }}
                    className="gap-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Clear Filters
                  </Button>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    Showing {filteredAppointments.length} bookings
                  </span>
                )}
              </div>
            </div>

            {/* Appointments Table */}
            {filteredAppointments.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-xs space-y-3">
                <Calendar className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No appointments found</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  No appointments match your active filter settings.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Donor</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Blood Group</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Date &amp; Time Slot</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Notes / Resolution</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
{filteredAppointments.map((a, index) => (
  <TableRow key={a._id?.toString() ?? `${a.donorName}-${index}`}>
    <TableCell>
      <span className="font-semibold text-slate-900 dark:text-slate-100">
        {a.donorName}
      </span>
      <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
        {a.donorEmail} {a.donorPhone ? `• ${a.donorPhone}` : ''}
      </span>
    </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 px-2.5 py-0.5 rounded-md text-xs">
                              {a.bloodGroup || 'N/A'}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs font-medium text-slate-900 dark:text-slate-100">
                            <span className="block font-semibold">{a.slotDate}</span>
                            <span className="text-slate-500 dark:text-slate-400">{a.timeSlot}</span>
                          </TableCell>
                          <TableCell>{getStatusBadge(a.status)}</TableCell>
                          <TableCell className="text-xs">
                            {a.status === 'Cancelled' ? (
                              <span className="text-red-700 dark:text-red-400 italic">
                                Reason: {a.cancellationReason || 'Cancelled'}
                              </span>
                            ) : a.status === 'Completed' ? (
                              <span className="text-slate-600 dark:text-slate-400">Attendance completed</span>
                            ) : (
                              <span className="text-slate-500 dark:text-slate-400 italic truncate max-w-xs block">
                                {a.notes || 'Routine donation appointment'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {a.status === 'Scheduled' && (
                                <Button
                                  size="sm"
                                  onClick={() => handleConfirm(a._id ? a._id.toString() : '')}
                                  disabled={updatingId === a._id?.toString()}
                                  className="h-7 text-xs px-2.5 bg-emerald-600 hover:bg-emerald-700 gap-1 text-white"
                                >
                                  <Check className="h-3 w-3" /> Confirm
                                </Button>
                              )}
                              {(a.status === 'Scheduled' || a.status === 'Confirmed') && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleComplete(a._id ? a._id.toString() : '')}
                                    disabled={updatingId === a._id?.toString()}
                                    className="h-7 text-xs px-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-700"
                                  >
                                    Complete
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setCancellingAppt(a)
                                      setCancelReason('Cancelled by donor center')
                                    }}
                                    disabled={updatingId === a._id?.toString()}
                                    className="h-7 text-xs px-2 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300"
                                  >
                                    Cancel
                                  </Button>
                                </>
                              )}
                              {a.status === 'Completed' && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => router.push('/admin/donations')}
                                  className="h-7 text-xs px-2 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300 gap-1"
                                >
                                  <Heart className="h-3 w-3" /> Log Bleed
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Admin Cancel Dialog */}
      <Dialog open={Boolean(cancellingAppt)} onOpenChange={(open) => !open && setCancellingAppt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="h-5 w-5" /> Cancel Appointment
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Cancelling this appointment will release the slot capacity back to the public pool.
            </DialogDescription>
          </DialogHeader>

          {cancellingAppt && (
            <div className="space-y-3 py-2 text-xs">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2.5 space-y-1 border border-slate-200 dark:border-slate-800">
                <p>
                  <span className="text-slate-500 dark:text-slate-400">Donor:</span>{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{cancellingAppt.donorName}</span>
                </p>
                <p>
                  <span className="text-slate-500 dark:text-slate-400">Date &amp; Slot:</span>{' '}
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {cancellingAppt.slotDate} ({cancellingAppt.timeSlot})
                  </span>
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Reason for Cancellation:
                </label>
                <Textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={2}
                  className="text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCancellingAppt(null)}
              className="text-xs"
            >
              Keep Booking
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmCancel}
              disabled={Boolean(updatingId) || !cancelReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-xs"
            >
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

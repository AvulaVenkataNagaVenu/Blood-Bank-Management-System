'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/admin/dashboard-header'
import { Sidebar } from '@/components/admin/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
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
import { Badge } from '@/components/ui/badge'
import {
  Heart,
  Plus,
  Search,
  CheckCircle,
  Clock,
  XCircle,
  AlertCircle,
  Check,
  X,
  Droplets,
  RotateCcw,
} from 'lucide-react'
import { VALID_BLOOD_GROUPS } from '@/lib/validation'
import type { Donation, User } from '@/lib/types'

export default function AdminDonationsPage() {
  const router = useRouter()
  const [adminUser, setAdminUser] = useState<any>(null)
  const [donations, setDonations] = useState<Donation[]>([])
  const [donors, setDonors] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Search and Filter State
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [bloodGroupFilter, setBloodGroupFilter] = useState<string>('All')

  // Modal State for Recording New Donation
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false)
  const [selectedDonorId, setSelectedDonorId] = useState('')
  const [formBloodGroup, setFormBloodGroup] = useState('')
  const [formUnits, setFormUnits] = useState(1)
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [formNotes, setFormNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      // 1. Verify admin session
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

      // 2. Fetch all donations
      const donationsRes = await fetch('/api/donations')
      if (donationsRes.ok) {
        const donationsData = await donationsRes.json()
        setDonations(donationsData.data || [])
      }

      // 3. Fetch registered donors for dropdown selection
      const donorsRes = await fetch('/api/users?role=Donor')
      if (donorsRes.ok) {
        const donorsData = await donorsRes.json()
        setDonors(donorsData.data || [])
      }
    } catch (error) {
      console.error('[donations] Error loading page data:', error)
      setMessage({ type: 'error', text: 'Failed to load donations from server.' })
    } finally {
      setLoading(false)
    }
  }, [router])

useEffect(() => {
  const timer = window.setTimeout(() => {
    void fetchData()
  }, 0)

  return () => window.clearTimeout(timer)
}, [fetchData])

  // When donor is selected in modal, auto-fill blood group
  const handleDonorSelect = (donorId: string) => {
    setSelectedDonorId(donorId)
    const donor = donors.find((d) => (d._id ? d._id.toString() : '') === donorId)
    if (donor && donor.bloodGroup) {
      setFormBloodGroup(donor.bloodGroup)
    }
  }

  // Handle Record Donation Submission
  const handleRecordDonation = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!selectedDonorId) {
      setFormError('Please select a registered donor.')
      return
    }

    if (!formBloodGroup) {
      setFormError('Blood group is required.')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/donations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donorId: selectedDonorId,
          bloodGroup: formBloodGroup,
          units: Number(formUnits),
          donationDate: formDate,
          status: 'Completed',
          notes: formNotes,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setDonations((prev) => [data.data, ...prev])
        setMessage({
          type: 'success',
          text: `Donation recorded successfully! ${formUnits} unit(s) credited to ${formBloodGroup} inventory.`,
        })
        setIsRecordModalOpen(false)
        // Reset form
        setSelectedDonorId('')
        setFormBloodGroup('')
        setFormUnits(1)
        setFormNotes('')
      } else {
        setFormError(data.error || 'Failed to record donation.')
      }
    } catch (error) {
      console.error('[donations] Submission error:', error)
      setFormError('A network error occurred while recording donation.')
    } finally {
      setSubmitting(false)
    }
  }

  // Filtered donations
  const filteredDonations = useMemo(() => {
    return donations.filter((d) => {
      if (statusFilter !== 'All' && d.status !== statusFilter) return false
      if (bloodGroupFilter !== 'All' && d.bloodGroup !== bloodGroupFilter) return false
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase().trim()
        const matchName = d.donorName.toLowerCase().includes(query)
        const matchGroup = d.bloodGroup.toLowerCase().includes(query)
        const matchEmail = (d.donorEmail || '').toLowerCase().includes(query)
        return matchName || matchGroup || matchEmail
      }
      return true
    })
  }, [donations, statusFilter, bloodGroupFilter, searchTerm])

  const statusCounts = useMemo(() => {
    return {
      all: donations.length,
      completed: donations.filter((d) => d.status === 'Completed').length,
      pending: donations.filter((d) => d.status === 'Pending').length,
      cancelled: donations.filter((d) => d.status === 'Cancelled').length,
    }
  }, [donations])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed':
        return (
          <Badge className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 gap-1 text-xs">
            <CheckCircle className="h-3 w-3" /> Completed
          </Badge>
        )
      case 'Pending':
        return (
          <Badge className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 gap-1 text-xs">
            <Clock className="h-3 w-3" /> Pending
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
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading donation records...</p>
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
            {/* Page Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Blood Donation Ledger</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Track donor contributions, record verified bleeds, and audit automatic stock additions
                </p>
              </div>

              <Button
                onClick={() => {
                  setFormError(null)
                  setIsRecordModalOpen(true)
                }}
                className="bg-red-600 hover:bg-red-700 gap-2 text-xs text-white shadow-xs rounded-xl"
              >
                <Plus className="h-4 w-4" /> Record Blood Donation
              </Button>
            </div>

            {/* Notification message */}
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
                All Donations
                <span className="rounded-full bg-slate-200/70 dark:bg-slate-800 px-1.5 py-0.2 text-[10px]">
                  {statusCounts.all}
                </span>
              </button>

              <button
                onClick={() => setStatusFilter('Completed')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'Completed'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                Completed
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 px-1.5 py-0.2 text-[10px]">
                  {statusCounts.completed}
                </span>
              </button>

              <button
                onClick={() => setStatusFilter('Pending')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'Pending'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                Pending
                <span className="rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 px-1.5 py-0.2 text-[10px]">
                  {statusCounts.pending}
                </span>
              </button>
            </div>

            {/* Filter Controls */}
            <div className="grid gap-3 sm:grid-cols-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search donor name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <Select value={bloodGroupFilter} onValueChange={setBloodGroupFilter}>
                  <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                    <SelectValue placeholder="Filter blood group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Blood Groups</SelectItem>
                    {VALID_BLOOD_GROUPS.map((bg) => (
                      <SelectItem key={bg} value={bg}>
                        {bg}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-end">
                {searchTerm || bloodGroupFilter !== 'All' || statusFilter !== 'All' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSearchTerm('')
                      setBloodGroupFilter('All')
                      setStatusFilter('All')
                    }}
                    className="gap-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Clear Filters
                  </Button>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500">Total {donations.length} records</span>
                )}
              </div>
            </div>

            {/* Donations Table */}
            {filteredDonations.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-xs space-y-3">
                <Heart className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" />
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No donation records found</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  Click &ldquo;Record Blood Donation&rdquo; above to log a new donor contribution and
                  credit the blood stock.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="min-w-[760px]">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Donor Name</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Blood Group</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Units</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Donation Date</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Stock Credited</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Logged By</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredDonations.map((d, index) => (
                        <TableRow key={d._id ? d._id.toString() : `${d.donorName}-${index}`}>
                          <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                            {d.donorName}
                            {d.donorEmail && (
                              <span className="block text-[11px] font-normal text-slate-500 dark:text-slate-400">
                                {d.donorEmail}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 px-2.5 py-0.5 rounded-md text-xs">
                              {d.bloodGroup}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium text-slate-800 dark:text-slate-200 text-xs">
                            {d.units} {d.units === 1 ? 'unit' : 'units'}
                          </TableCell>
                          <TableCell>{getStatusBadge(d.status)}</TableCell>
                          <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                            {new Date(d.donationDate).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </TableCell>
                          <TableCell className="text-xs">
                            {d.stockCredited ? (
                              <span className="text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-500" /> Yes (+{d.units})
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">No</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 dark:text-slate-400">{d.adminName}</TableCell>
                          <TableCell className="text-xs text-slate-500 dark:text-slate-400 italic max-w-xs truncate">
                            {d.notes || 'Routine donation'}
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

      {/* Record Donation Modal Dialog */}
      <Dialog open={isRecordModalOpen} onOpenChange={setIsRecordModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Droplets className="h-5 w-5 text-red-600 dark:text-red-500" /> Record Blood Donation
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Log a verified blood donation. Completing this record will automatically increment the
              inventory balance for the selected blood group.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleRecordDonation} className="space-y-4 py-2">
            {formError && (
              <div className="rounded-md bg-red-50 dark:bg-red-950/50 p-2.5 text-xs text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Select Donor */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Select Registered Donor:
              </label>
              <Select value={selectedDonorId} onValueChange={handleDonorSelect}>
                <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                  <SelectValue placeholder="Choose donor..." />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {donors.map((d) => (
                    <SelectItem key={d._id ? d._id.toString() : ''} value={d._id ? d._id.toString() : ''}>
                      {d.name} ({d.bloodGroup || 'Blood type unassigned'}) - {d.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Blood Group */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Blood Group:
                </label>
                <Select value={formBloodGroup} onValueChange={setFormBloodGroup}>
                  <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                    <SelectValue placeholder="Group" />
                  </SelectTrigger>
                  <SelectContent>
                    {VALID_BLOOD_GROUPS.map((bg) => (
                      <SelectItem key={bg} value={bg}>
                        {bg}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Units Collected:
                </label>
                <Input
                  type="number"
                  min="1"
                  max="2"
                  value={formUnits}
                  onChange={(e) => setFormUnits(parseInt(e.target.value) || 1)}
                  className="h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            {/* Donation Date */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Donation Date:
              </label>
              <Input
                type="date"
                max={new Date().toISOString().split('T')[0]}
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Notes / Bag Lot Reference:
              </label>
              <Textarea
                placeholder="Optional notes, collection bag lot number, or phlebotomist remark..."
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                rows={2}
                className="text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsRecordModalOpen(false)}
                disabled={submitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || !selectedDonorId || !formBloodGroup}
                className="bg-red-600 hover:bg-red-700 text-xs gap-1.5"
              >
                {submitting ? 'Recording & Crediting...' : 'Confirm & Credit Stock'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

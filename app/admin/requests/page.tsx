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
  AlertCircle,
  Check,
  Search,
  SlidersHorizontal,
  X,
  Clock,
  CheckCircle,
  XCircle,
  ArrowUpDown,
  RotateCcw,
  Info,
  Droplets,
  History,
  Send,
  ShieldAlert,
} from 'lucide-react'
import { VALID_BLOOD_GROUPS, CLINICAL_REVIEW_DISCLAIMER } from '@/lib/validation'

interface BloodRequest {
  _id: string
  hospitalName: string
  bloodGroup: string
  unitsRequired: number
  unitsIssued?: number
  priority?: 'Normal' | 'Emergency'
  status: 'Pending' | 'Approved' | 'Partially Issued' | 'Issued' | 'Rejected' | 'Cancelled'
  requestDate: string
  approvedDate?: string
  rejectionReason?: string
  cancellationReason?: string
  statusHistory?: Array<{
    status: string
    changedByName: string
    changedByRole: string
    changedAt: string
    notes?: string
    reason?: string
  }>
}

const REJECTION_PRESETS = [
  'Insufficient inventory for requested blood group',
  'Hospital order exceeded safety quota',
  'Duplicate request submission detected',
  'Inter-hospital transfer required',
  'Verification documentation incomplete',
]

export default function RequestsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [requests, setRequests] = useState<BloodRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Search, Filter & Sort State
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [bloodGroupFilter, setBloodGroupFilter] = useState<string>('All')
  const [priorityFilter, setPriorityFilter] = useState<string>('All')
  const [sortBy, setSortBy] = useState<string>('date-desc')

  // Rejection Dialog State
  const [rejectingRequest, setRejectingRequest] = useState<BloodRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState<string>('')
  const [rejectionError, setRejectionError] = useState<string | null>(null)

  // Blood Issuance Dialog State
  const [issuingRequest, setIssuingRequest] = useState<BloodRequest | null>(null)
  const [issueQuantity, setIssueQuantity] = useState<string>('1')
  const [issueNotes, setIssueNotes] = useState<string>('')
  const [issueSubmitting, setIssueSubmitting] = useState<boolean>(false)
  const [issueError, setIssueError] = useState<string | null>(null)

  // Status History Modal State
  const [historyRequest, setHistoryRequest] = useState<BloodRequest | null>(null)

  const fetchRequests = useCallback(async () => {
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

      setUser(userData.data)

      // 2. Fetch requests from API
      const requestsRes = await fetch('/api/blood-requests')
      if (requestsRes.ok) {
        const requestsData = await requestsRes.json()
        setRequests(requestsData.data || [])
      } else {
        setMessage({ type: 'error', text: 'Failed to retrieve blood requests from server' })
      }
    } catch (error) {
      console.error('[admin] Error fetching requests:', error)
      setMessage({ type: 'error', text: 'An unexpected connection error occurred' })
    } finally {
      setLoading(false)
    }
  }, [router])

useEffect(() => {
  const timer = window.setTimeout(() => {
    void fetchRequests()
  }, 0)

  return () => window.clearTimeout(timer)
}, [fetchRequests])

  // Approve Request Handler
  const handleApprove = async (requestId: string) => {
    setUpdating(requestId)
    setMessage(null)

    try {
      const response = await fetch(`/api/blood-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Approved' }),
      })

      const data = await response.json()

      if (response.ok) {
        setRequests((prev) =>
          prev.map((req) =>
            req._id === requestId
              ? { ...req, status: 'Approved', approvedDate: new Date().toISOString() }
              : req
          )
        )
        setMessage({
          type: 'success',
          text: 'Request approved successfully. It is now authorized for clinical blood issuance.',
        })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to approve request' })
      }
    } catch (error) {
      console.error('[admin] Error approving request:', error)
      setMessage({ type: 'error', text: 'An unexpected error occurred during approval' })
    } finally {
      setUpdating(null)
    }
  }

  // Open Blood Issuance Dialog
  const openIssueDialog = (request: BloodRequest) => {
    setIssuingRequest(request)
    const remaining = request.unitsRequired - (request.unitsIssued || 0)
    setIssueQuantity(String(remaining > 0 ? remaining : 1))
    setIssueNotes('')
    setIssueError(null)
  }

  // Confirm Blood Issuance Handler
  const handleConfirmIssue = async () => {
    if (!issuingRequest) return
    const qty = parseInt(issueQuantity, 10)
    if (isNaN(qty) || qty <= 0) {
      setIssueError('Please specify a positive integer quantity to issue.')
      return
    }

    const remaining = issuingRequest.unitsRequired - (issuingRequest.unitsIssued || 0)
    if (qty > remaining) {
      setIssueError(`Cannot issue ${qty} units. Maximum remaining is ${remaining} units.`)
      return
    }

    setIssueSubmitting(true)
    setIssueError(null)

    try {
      const response = await fetch('/api/blood-issuances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: issuingRequest._id,
          quantity: qty,
          recipientNotes: issueNotes,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        const nextIssued = (issuingRequest.unitsIssued || 0) + qty
        const nextStatus = nextIssued >= issuingRequest.unitsRequired ? 'Issued' : 'Partially Issued'

        setRequests((prev) =>
          prev.map((r) =>
            r._id === issuingRequest._id
              ? {
                  ...r,
                  unitsIssued: nextIssued,
                  status: nextStatus as any,
                }
              : r
          )
        )
        setMessage({
          type: 'success',
          text: `Successfully issued ${qty} units of ${issuingRequest.bloodGroup} to ${issuingRequest.hospitalName}. Stock was deducted and audit ledger logged.`,
        })
        setIssuingRequest(null)
      } else {
        setIssueError(data.error || 'Failed to issue blood units.')
      }
    } catch (err) {
      console.error('Issuance error:', err)
      setIssueError('Connection error while processing blood issuance.')
    } finally {
      setIssueSubmitting(false)
    }
  }

  // Open Rejection Dialog
  const openRejectionDialog = (request: BloodRequest) => {
    setRejectingRequest(request)
    setRejectionReason(REJECTION_PRESETS[0])
    setRejectionError(null)
  }

  // Confirm Rejection with Persisted Reason
  const handleConfirmReject = async () => {
    if (!rejectingRequest) return

    if (!rejectionReason.trim()) {
      setRejectionError('Please provide a valid rejection explanation.')
      return
    }

    setUpdating(rejectingRequest._id)
    setRejectionError(null)

    try {
      const response = await fetch(`/api/blood-requests/${rejectingRequest._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Rejected',
          rejectionReason: rejectionReason.trim(),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setRequests((prev) =>
          prev.map((req) =>
            req._id === rejectingRequest._id
              ? { ...req, status: 'Rejected', rejectionReason: rejectionReason.trim() }
              : req
          )
        )
        setMessage({
          type: 'success',
          text: `Request for ${rejectingRequest.hospitalName} was rejected with reason recorded.`,
        })
        setRejectingRequest(null)
      } else {
        setRejectionError(data.error || 'Failed to reject request')
      }
    } catch (error) {
      console.error('[admin] Error rejecting request:', error)
      setRejectionError('An unexpected server error occurred')
    } finally {
      setUpdating(null)
    }
  }

  // Compute status counts for filter tabs
  const statusCounts = useMemo(() => {
    return {
      all: requests.length,
      pending: requests.filter((r) => r.status === 'Pending').length,
      approved: requests.filter((r) => r.status === 'Approved').length,
      issued: requests.filter((r) => r.status === 'Issued' || r.status === 'Partially Issued').length,
      rejected: requests.filter((r) => r.status === 'Rejected').length,
    }
  }, [requests])

  // Filter & Sort Logic
  const filteredAndSortedRequests = useMemo(() => {
    return requests
      .filter((req) => {
        // Status filter
        if (statusFilter !== 'All') {
          if (statusFilter === 'Issued') {
            if (req.status !== 'Issued' && req.status !== 'Partially Issued') return false
          } else if (req.status !== statusFilter) {
            return false
          }
        }

        // Priority filter
        if (priorityFilter !== 'All' && (req.priority || 'Normal') !== priorityFilter) {
          return false
        }

        // Blood group filter
        if (bloodGroupFilter !== 'All' && req.bloodGroup !== bloodGroupFilter) {
          return false
        }

        // Search query (hospital name, blood group, or ID)
        if (searchTerm.trim()) {
          const query = searchTerm.toLowerCase().trim()
          const matchName = req.hospitalName.toLowerCase().includes(query)
          const matchGroup = req.bloodGroup.toLowerCase().includes(query)
          const matchId = req._id.toLowerCase().includes(query)
          return matchName || matchGroup || matchId
        }

        return true
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'date-desc':
            return new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime()
          case 'date-asc':
            return new Date(a.requestDate).getTime() - new Date(b.requestDate).getTime()
          case 'units-desc':
            return b.unitsRequired - a.unitsRequired
          case 'units-asc':
            return a.unitsRequired - b.unitsRequired
          case 'hospital-asc':
            return a.hospitalName.localeCompare(b.hospitalName)
          case 'hospital-desc':
            return b.hospitalName.localeCompare(a.hospitalName)
          default:
            return 0
        }
      })
  }, [requests, statusFilter, bloodGroupFilter, priorityFilter, searchTerm, sortBy])

  const resetFilters = () => {
    setSearchTerm('')
    setStatusFilter('All')
    setBloodGroupFilter('All')
    setPriorityFilter('All')
    setSortBy('date-desc')
  }

  const isFiltered =
    searchTerm !== '' ||
    statusFilter !== 'All' ||
    bloodGroupFilter !== 'All' ||
    priorityFilter !== 'All' ||
    sortBy !== 'date-desc'

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return (
          <Badge className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 hover:bg-amber-100 border-amber-200 dark:border-amber-800 gap-1 text-xs">
            <Clock className="h-3 w-3" /> Pending
          </Badge>
        )
      case 'Approved':
        return (
          <Badge className="bg-blue-100 dark:bg-blue-950/60 text-blue-800 dark:text-blue-300 hover:bg-blue-100 border-blue-200 dark:border-blue-800 gap-1 text-xs">
            <CheckCircle className="h-3 w-3" /> Approved
          </Badge>
        )
      case 'Partially Issued':
        return (
          <Badge className="bg-cyan-100 dark:bg-cyan-950/60 text-cyan-800 dark:text-cyan-300 hover:bg-cyan-100 border-cyan-200 dark:border-cyan-800 gap-1 text-xs">
            <Droplets className="h-3 w-3" /> Partially Issued
          </Badge>
        )
      case 'Issued':
        return (
          <Badge className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 border-emerald-200 dark:border-emerald-800 gap-1 text-xs">
            <Check className="h-3 w-3" /> Issued
          </Badge>
        )
      case 'Rejected':
        return (
          <Badge className="bg-red-100 dark:bg-red-950/60 text-red-800 dark:text-red-300 hover:bg-red-100 border-red-200 dark:border-red-800 gap-1 text-xs">
            <XCircle className="h-3 w-3" /> Rejected
          </Badge>
        )
      case 'Cancelled':
        return (
          <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-300 hover:bg-slate-100 border-slate-200 dark:border-slate-700 gap-1 text-xs">
            <X className="h-3 w-3" /> Cancelled
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
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading blood requests...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader
          userName={user.name}
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
        />

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1600px] space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Hospital Blood Requests</h1>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Search, filter, review, and process hospital blood supply allocations
              </p>
            </div>

            {/* Notification Banner */}
            {message && (
              <div
                className={`flex items-center gap-2 rounded-xl p-4 text-sm shadow-xs transition-all animate-in fade-in-50 ${
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
                <button
                  onClick={() => setMessage(null)}
                  className="rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/5 text-slate-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Status Tab Filters with Horizontal Scroll */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setStatusFilter('All')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'All'
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                All Requests
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    statusFilter === 'All' ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {statusCounts.all}
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
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    statusFilter === 'Pending' ? 'bg-white/20 text-white' : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {statusCounts.pending}
                </span>
              </button>

              <button
                onClick={() => setStatusFilter('Approved')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'Approved'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                Approved
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    statusFilter === 'Approved'
                      ? 'bg-white/20 text-white'
                      : 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                  }`}
                >
                  {statusCounts.approved}
                </span>
              </button>

              <button
                onClick={() => setStatusFilter('Issued')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'Issued'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                Issued / Fulfilled
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    statusFilter === 'Issued'
                      ? 'bg-white/20 text-white'
                      : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                  }`}
                >
                  {statusCounts.issued}
                </span>
              </button>

              <button
                onClick={() => setStatusFilter('Rejected')}
                className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'Rejected'
                    ? 'bg-red-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800'
                }`}
              >
                Rejected
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] ${
                    statusFilter === 'Rejected' ? 'bg-white/20 text-white' : 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300'
                  }`}
                >
                  {statusCounts.rejected}
                </span>
              </button>
            </div>

            {/* Filter Bar: Search, Blood Group, Priority & Sort Controls */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
              {/* 1. Search Box */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search hospital or group..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* 2. Blood Group Filter */}
              <div>
                <Select value={bloodGroupFilter} onValueChange={setBloodGroupFilter}>
                  <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                    <SelectValue placeholder="Filter by blood group" />
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

              {/* 3. Priority Filter */}
              <div>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                    <SelectValue placeholder="Filter by priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Priorities</SelectItem>
                    <SelectItem value="Emergency">🚨 Emergency Only</SelectItem>
                    <SelectItem value="Normal">Normal Routine</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 4. Sort Order Control */}
              <div>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                      <ArrowUpDown className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
                      <SelectValue placeholder="Sort by" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date-desc">Date (Newest first)</SelectItem>
                    <SelectItem value="date-asc">Date (Oldest first)</SelectItem>
                    <SelectItem value="units-desc">Units (Highest first)</SelectItem>
                    <SelectItem value="units-asc">Units (Lowest first)</SelectItem>
                    <SelectItem value="hospital-asc">Hospital (A - Z)</SelectItem>
                    <SelectItem value="hospital-desc">Hospital (Z - A)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 5. Reset Filters Button */}
              <div className="flex items-center justify-end">
                {isFiltered ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="h-9 gap-1.5 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Reset Filters
                  </Button>
                ) : (
                  <span className="text-xs text-slate-400 dark:text-slate-500 px-2">
                    Showing all {requests.length} records
                  </span>
                )}
              </div>
            </div>

            {/* Requests Table */}
            {filteredAndSortedRequests.length === 0 ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-xs space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                  <Search className="h-6 w-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">No requests found</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  {isFiltered
                    ? 'No requests match your current search and filter settings. Try adjusting your search query or resetting filters.'
                    : 'No blood requests have been submitted by partner hospitals yet.'}
                </p>
                {isFiltered && (
                  <Button variant="outline" size="sm" onClick={resetFilters} className="text-xs">
                    Clear all filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                <div className="overflow-x-auto">
                  <Table className="min-w-[880px]">
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Priority</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Hospital</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Blood Group</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Units (Issued / Req)</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Status</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Request Date</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300">History & Details</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-300 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAndSortedRequests.map((request) => (
                        <TableRow key={request._id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <TableCell>
                            {request.priority === 'Emergency' ? (
                            <Badge className="bg-red-600 text-white font-bold animate-pulse border-none text-[10px] px-2 py-0.5">
                              🚨 Emergency
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-600 dark:text-slate-300 text-[10px] px-2 py-0.5 border-slate-200 dark:border-slate-700">
                              Normal
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold text-slate-900 dark:text-slate-100">
                          {request.hospitalName}
                        </TableCell>
                        <TableCell>
                          <span className="inline-flex items-center justify-center font-bold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 border border-red-200 dark:border-red-800 px-2 py-0.5 rounded text-xs">
                            {request.bloodGroup}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                          <span className="font-bold text-slate-900 dark:text-slate-100">{request.unitsIssued || 0}</span>
                          <span className="text-slate-400 dark:text-slate-500"> / {request.unitsRequired} units</span>
                        </TableCell>
                        <TableCell>{getStatusBadge(request.status)}</TableCell>
                        <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                          {new Date(request.requestDate).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-[11px] gap-1 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800"
                              onClick={() => setHistoryRequest(request)}
                            >
                              <History className="h-3 w-3 text-slate-500 dark:text-slate-400" /> Audit History
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {request.status === 'Pending' ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white h-7 px-2.5 text-xs gap-1"
                                onClick={() => handleApprove(request._id)}
                                disabled={updating === request._id}
                              >
                                {updating === request._id ? (
                                  '...'
                                ) : (
                                  <>
                                    <Check className="h-3 w-3" /> Approve
                                  </>
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-700 dark:hover:text-red-300 h-7 px-2.5 text-xs gap-1"
                                onClick={() => openRejectionDialog(request)}
                                disabled={updating === request._id}
                              >
                                <X className="h-3 w-3" /> Reject
                              </Button>
                            </div>
                          ) : request.status === 'Approved' || request.status === 'Partially Issued' ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white h-7 px-2.5 text-xs gap-1 font-medium shadow-sm"
                                onClick={() => openIssueDialog(request)}
                              >
                                <Droplets className="h-3 w-3" /> Issue Blood
                              </Button>
                              {(request.unitsIssued || 0) === 0 && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 h-7 px-2 text-xs"
                                  onClick={() => openRejectionDialog(request)}
                                >
                                  Reject
                                </Button>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">{request.status}</span>
                          )}
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

      {/* 1. Admin Blood Issuance Dialog Modal */}
      <Dialog
        open={Boolean(issuingRequest)}
        onOpenChange={(open) => !open && setIssuingRequest(null)}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
              <Droplets className="h-5 w-5" />
              Issue & Dispense Blood Units
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Dispense cross-matched blood inventory to fulfill this authorized hospital requisition.
            </DialogDescription>
          </DialogHeader>

          {issuingRequest && (
            <div className="space-y-4 py-2">
              {/* Request Context Summary */}
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3.5 text-xs space-y-1.5 border border-slate-200 dark:border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Destination Hospital:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{issuingRequest.hospitalName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Requested Blood Group:</span>
                  <span className="font-bold text-red-600 dark:text-red-400 text-sm">{issuingRequest.bloodGroup}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Requisition Progress:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {issuingRequest.unitsIssued || 0} already issued / {issuingRequest.unitsRequired} total requested
                  </span>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1.5 font-medium text-emerald-800 dark:text-emerald-400">
                  <span>Remaining to Fulfill:</span>
                  <span>{issuingRequest.unitsRequired - (issuingRequest.unitsIssued || 0)} units</span>
                </div>
              </div>

              {/* Error message */}
              {issueError && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/50 p-2.5 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{issueError}</span>
                </div>
              )}

              {/* Quantity Input */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Units to Dispense & Issue:
                </label>
                <Input
                  type="number"
                  min="1"
                  max={issuingRequest.unitsRequired - (issuingRequest.unitsIssued || 0)}
                  value={issueQuantity}
                  onChange={(e) => setIssueQuantity(e.target.value)}
                  className="text-xs h-9 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Recipient & Crossmatch Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Verification & Courier Notes (Optional):
                </label>
                <Textarea
                  value={issueNotes}
                  onChange={(e) => setIssueNotes(e.target.value)}
                  placeholder="e.g. Recipient patient ID #, cross-match slip #, courier staff badge #..."
                  rows={2}
                  className="text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Mandatory Clinical Review Notice */}
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/50 p-3 text-[11px] text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900/50 space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <ShieldAlert className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" /> Clinical Review Notice
                </div>
                <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
                  {CLINICAL_REVIEW_DISCLAIMER}
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIssuingRequest(null)}
              disabled={issueSubmitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmIssue}
              disabled={issueSubmitting}
              className="bg-emerald-600 hover:bg-emerald-700 text-xs gap-1.5 text-white"
            >
              {issueSubmitting ? 'Processing Dispensation...' : 'Confirm Issuance & Deduct Stock'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Traceable Status History Modal */}
      <Dialog
        open={Boolean(historyRequest)}
        onOpenChange={(open) => !open && setHistoryRequest(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
              <History className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              Requisition Lifecycle Audit Trail
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Traceable timestamped history for request #{historyRequest?._id?.slice(-6)}.
            </DialogDescription>
          </DialogHeader>

          {historyRequest && (
            <div className="space-y-3 py-2 max-h-[350px] overflow-y-auto pr-1">
              {(!historyRequest.statusHistory || historyRequest.statusHistory.length === 0) ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic p-3 text-center">
                  No historical state transitions recorded for this record.
                </p>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
                  {historyRequest.statusHistory.map((step, idx) => (
                    <div key={idx} className="relative space-y-1 text-xs">
                      <div className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 bg-slate-600 dark:bg-slate-400 shadow-xs" />
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{step.status}</span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">
                          {new Date(step.changedAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                        By: <span className="font-medium text-slate-700 dark:text-slate-300">{step.changedByName}</span> ({step.changedByRole})
                      </p>
                      {step.reason && (
                        <p className="text-red-700 dark:text-red-300 text-[11px] bg-red-50 dark:bg-red-950/50 p-1.5 rounded border border-red-100 dark:border-red-900/40">
                          Reason: {step.reason}
                        </p>
                      )}
                      {step.notes && (
                        <p className="text-slate-500 dark:text-slate-400 text-[11px] italic">
                          &ldquo;{step.notes}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHistoryRequest(null)}
              className="text-xs"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Admin Rejection-Reason Dialog Modal */}
      <Dialog
        open={Boolean(rejectingRequest)}
        onOpenChange={(open) => !open && setRejectingRequest(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertCircle className="h-5 w-5" />
              Confirm Request Rejection
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 dark:text-slate-400">
              Provide an explanation for the hospital regarding why this blood request cannot be
              fulfilled.
            </DialogDescription>
          </DialogHeader>

          {rejectingRequest && (
            <div className="space-y-4 py-2">
              {/* Request Context Summary */}
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3 text-xs space-y-1.5 border border-slate-200 dark:border-slate-800">
                <p className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Hospital:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{rejectingRequest.hospitalName}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Blood Group:</span>
                  <span className="font-bold text-red-600 dark:text-red-400">{rejectingRequest.bloodGroup}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Units Requested:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {rejectingRequest.unitsRequired} units
                  </span>
                </p>
              </div>

              {/* Error inside modal */}
              {rejectionError && (
                <div className="rounded-md bg-red-50 dark:bg-red-950/50 p-2.5 text-xs text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/50 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{rejectionError}</span>
                </div>
              )}

              {/* Common Presets */}
              <div>
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">
                  Select Common Reason Preset:
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {REJECTION_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setRejectionReason(preset)}
                      className={`text-[11px] rounded px-2.5 py-1 text-left transition-colors border ${
                        rejectionReason === preset
                          ? 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 font-semibold'
                          : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Textarea for Customization */}
              <div>
                <label htmlFor="rejectionReasonInput" className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Rejection Explanation (Sent to Hospital):
                </label>
                <Textarea
                  id="rejectionReasonInput"
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter specific explanation..."
                  rows={3}
                  className="text-xs bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRejectingRequest(null)}
              disabled={Boolean(updating)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleConfirmReject}
              disabled={Boolean(updating) || !rejectionReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-xs gap-1.5"
            >
              {updating ? 'Processing...' : 'Confirm Rejection'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

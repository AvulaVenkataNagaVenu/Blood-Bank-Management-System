'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { PortalHeader } from '@/components/portal-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { LogOut, Droplets, Plus, RefreshCw, AlertCircle, Check } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

interface BloodRequest {
  _id: string
  bloodGroup: string
  unitsRequired: number
  unitsIssued?: number
  priority?: 'Normal' | 'Emergency'
  status: 'Pending' | 'Approved' | 'Partially Issued' | 'Issued' | 'Rejected' | 'Cancelled'
  requestDate: string
  rejectionReason?: string
  cancellationReason?: string
}

export default function HospitalDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [requests, setRequests] = useState<BloodRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [formData, setFormData] = useState({
    bloodGroup: '',
    unitsRequired: '',
    priority: 'Normal' as 'Normal' | 'Emergency',
  })

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/auth/me')
        if (!res.ok) {
          router.push('/')
          return
        }
        const data = await res.json()

        if (data.data?.role !== 'Hospital') {
          router.push('/')
          return
        }

        setUser(data.data)

        // Fetch requests
        const requestsRes = await fetch('/api/blood-requests')
        if (requestsRes.ok) {
          const requestsData = await requestsRes.json()
          setRequests(requestsData.data)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
        router.push('/')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)

    if (!formData.bloodGroup || !formData.unitsRequired) {
      setMessage({ type: 'error', text: 'Please fill in all fields' })
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/blood-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bloodGroup: formData.bloodGroup,
          unitsRequired: parseInt(formData.unitsRequired),
          priority: formData.priority,
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setRequests([data.data, ...requests])
        setFormData({ bloodGroup: '', unitsRequired: '', priority: 'Normal' })
        setMessage({
          type: 'success',
          text:
            formData.priority === 'Emergency'
              ? 'EMERGENCY blood request dispatched to blood bank command center.'
              : 'Blood request submitted successfully.',
        })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to submit request' })
      }
    } catch (error) {
      console.error('Error submitting request:', error)
      setMessage({ type: 'error', text: 'An error occurred' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancelRequest = async (requestId: string) => {
    if (!confirm('Are you sure you want to cancel this pending blood request?')) return
    setCancellingId(requestId)
    setMessage(null)

    try {
      const response = await fetch(`/api/blood-requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'Cancelled',
          cancellationReason: 'Cancelled by hospital requisition desk',
        }),
      })

      const data = await response.json()
      if (response.ok) {
        setRequests((prev) =>
          prev.map((r) => (r._id === requestId ? { ...r, status: 'Cancelled' as const } : r))
        )
        setMessage({ type: 'success', text: 'Blood request successfully cancelled.' })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to cancel request.' })
      }
    } catch (err) {
      console.error('Cancel request error:', err)
      setMessage({ type: 'error', text: 'Connection error while cancelling request.' })
    } finally {
      setCancellingId(null)
    }
  }

  const handleRefreshRequests = async () => {
    setRefreshing(true)
    try {
      const requestsRes = await fetch('/api/blood-requests')
      if (requestsRes.ok) {
        const requestsData = await requestsRes.json()
        setRequests(requestsData.data || [])
      } else {
        setMessage({ type: 'error', text: 'Failed to refresh blood requests.' })
      }
    } catch (err) {
      console.error('Error refreshing blood requests:', err)
      setMessage({ type: 'error', text: 'Network error refreshing request list.' })
    } finally {
      setRefreshing(false)
    }
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Pending':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-800'
      case 'Approved':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:border dark:border-blue-800'
      case 'Partially Issued':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border dark:border-cyan-800'
      case 'Issued':
        return 'bg-green-100 text-green-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800'
      case 'Rejected':
        return 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 dark:border dark:border-red-800'
      case 'Cancelled':
        return 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 dark:border dark:border-slate-700'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">Loading...</div>
  }

  if (!user) {
    return null
  }

  const pendingRequests = requests.filter((r) => r.status === 'Pending').length
  const approvedRequests = requests.filter((r) => r.status === 'Approved').length

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 transition-colors">
      <PortalHeader
        portalName="Hospital Portal"
        userName={user.hospitalName}
        userSubtitle={user.phone ? `Phone: ${user.phone}` : 'Hospital Partner'}
        roleBadgeText="Hospital"
        onLogout={handleLogout}
      />

      <div className="mx-auto w-full max-w-[1600px] px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Welcome, {user.hospitalName}!</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Request blood supplies and track dispensation status for your hospital</p>
        </div>

        {/* Stats */}
        <div className="grid gap-5 sm:grid-cols-3">
          <Card className="rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-slate-100">Hospital Info</CardTitle>
            </CardHeader>
            <CardContent>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Hospital</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{user.hospitalName}</p>
              </div>
              {user.phone && (
                <div className="mt-3">
                  <p className="text-sm text-slate-600 dark:text-slate-400">Phone</p>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{user.phone}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-slate-100">Pending Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{pendingRequests}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Awaiting approval</p>
            </CardContent>
          </Card>

          <Card className="rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-slate-100">Approved Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600 dark:text-emerald-400">{approvedRequests}</p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Successfully approved</p>
            </CardContent>
          </Card>
        </div>

        {/* Request Form */}
        <Card className="mb-8 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Plus className="h-5 w-5 text-red-600 dark:text-red-400" />
              Request Blood
            </CardTitle>
          </CardHeader>
          <CardContent>
            {message && (
              <div
                className={`mb-4 flex items-center gap-2 rounded-lg p-4 ${
                  message.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/60 dark:text-green-300 dark:border-green-800'
                    : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800'
                }`}
              >
                {message.type === 'success' ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <AlertCircle className="h-5 w-5" />
                )}
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmitRequest} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Blood Group</label>
                  <Select
                    value={formData.bloodGroup}
                    onValueChange={(value) => {
                      setFormData((prev) => ({ ...prev, bloodGroup: value }))
                    }}
                  >
                    <SelectTrigger className="mt-1 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                      <SelectValue placeholder="Select blood group" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                      {BLOOD_GROUPS.map((bg) => (
                        <SelectItem key={bg} value={bg}>
                          {bg}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Units Required</label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Enter number of units"
                    value={formData.unitsRequired}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, unitsRequired: e.target.value }))
                    }
                    className="mt-1 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Priority Level</label>
                  <Select
                    value={formData.priority}
                    onValueChange={(value: 'Normal' | 'Emergency') => {
                      setFormData((prev) => ({ ...prev, priority: value }))
                    }}
                  >
                    <SelectTrigger className="mt-1 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100">
                      <SelectItem value="Normal">Normal (Routine Supply)</SelectItem>
                      <SelectItem value="Emergency" className="text-red-600 dark:text-red-400 font-medium">
                        🚨 Emergency (Critical Transfusion)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button
                type="submit"
                className={`w-full cursor-pointer ${
                  formData.priority === 'Emergency'
                    ? 'bg-red-700 hover:bg-red-800 text-white font-semibold'
                    : ''
                }`}
                disabled={submitting}
              >
                {submitting
                  ? 'Submitting Request...'
                  : formData.priority === 'Emergency'
                    ? 'Submit Priority Emergency Requisition'
                    : 'Submit Blood Request'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Requests History */}
        <Card className="rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
            <div>
              <CardTitle className="text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Droplets className="h-5 w-5 text-red-600 dark:text-red-400" />
                Request History & Issuance Tracking
              </CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Live status and clinical dispensation tracking for blood requisitions
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshRequests}
              disabled={refreshing}
              className="h-8 gap-1.5 text-xs text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </CardHeader>
          <CardContent>
            {requests.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-slate-500 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-300">No blood requests recorded yet</p>
                <p className="text-xs mt-1 text-slate-500 dark:text-slate-400">
                  Submit a new blood supply requisition above to request units from the blood bank.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60">
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Priority</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Blood Group</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Units (Fulfilled / Req)</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Status</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Request Date</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Details & Resolution</TableHead>
                      <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-200">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {requests.map((request) => (
                      <TableRow key={request._id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                        <TableCell>
                          {request.priority === 'Emergency' ? (
                            <Badge className="bg-red-600 text-white border-none font-bold animate-pulse">
                              Emergency
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-slate-600 dark:text-slate-300 dark:border-slate-700">
                              Normal
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-semibold text-red-600 dark:text-red-400">
                          {request.bloodGroup}
                        </TableCell>
                        <TableCell>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {request.unitsIssued || 0} / {request.unitsRequired}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusBadgeColor(request.status)}>
                            {request.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 text-sm">
                          {new Date(request.requestDate).toLocaleDateString()}
                        </TableCell>
                        <TableCell className="text-xs">
                          {request.status === 'Rejected' && (
                            <span className="text-red-700 dark:text-red-400 italic">
                              Reason: {request.rejectionReason || 'Rejected by admin'}
                            </span>
                          )}
                          {request.status === 'Cancelled' && (
                            <span className="text-slate-600 dark:text-slate-400 italic">
                              Reason: {request.cancellationReason || 'Cancelled'}
                            </span>
                          )}
                          {request.status === 'Issued' && (
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                              ✓ Blood Units Issued & Dispatched
                            </span>
                          )}
                          {request.status === 'Partially Issued' && (
                            <span className="text-cyan-700 dark:text-cyan-400 font-medium">
                              Partially Issued ({request.unitsIssued}/{request.unitsRequired} units)
                            </span>
                          )}
                          {request.status === 'Approved' && (
                            <span className="text-blue-700 dark:text-blue-400 font-medium">
                              Approved (Awaiting Clinical Dispensation)
                            </span>
                          )}
                          {request.status === 'Pending' && (
                            <span className="text-amber-700 dark:text-amber-400 font-medium">
                              Under Admin Clinical Review
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {request.status === 'Pending' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-800 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-950/50 text-xs h-7 px-2 cursor-pointer"
                              disabled={cancellingId === request._id}
                              onClick={() => handleCancelRequest(request._id)}
                            >
                              {cancellingId === request._id ? 'Cancelling...' : 'Cancel'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

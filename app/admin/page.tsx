'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/admin/dashboard-header'
import { Sidebar } from '@/components/admin/sidebar'
import { StatsCard } from '@/components/admin/stats-card'
import { AdminAnalyticsCharts } from '@/components/admin/stock-chart'
import {
  Users,
  Droplets,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  SlidersHorizontal,
  RefreshCw,
  Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface DashboardData {
  donorCount: number
  hospitalCount: number
  pendingRequests: number
  approvedRequests: number
  rejectedRequests?: number
  totalRequests?: number
  totalUnits: number
  bloodGroupDistribution: Array<{ bloodGroup: string; unitsAvailable: number }>
  requestStats: Array<{ status: string; count: number }>
  criticalStockGroups?: Array<{ bloodGroup: string; unitsAvailable: number }>
  lowStockGroups?: Array<{ bloodGroup: string; unitsAvailable: number }>
}

export default function AdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [stats, setStats] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Configurable stock thresholds (defaults: Critical = 5, Low= 10)
  const [criticalThreshold, setCriticalThreshold] = useState<number>(5)
  const [lowThreshold, setLowThreshold] = useState<number>(10)
  const [showThresholdConfig, setShowThresholdConfig] = useState<boolean>(false)

  const fetchData = useCallback(async () => {
    try {
      // Wait for the first network response before changing state.
      // This avoids synchronous state updates from the initial effect.
      const userRes = await fetch('/api/auth/me')

      setLoading(true)
      setError(null)

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

      // Fetch aggregate dashboard statistics.
      const statsRes = await fetch('/api/dashboard/stats')
      if (!statsRes.ok) {
        let message = 'Failed to fetch dashboard statistics'
        try {
          const errorData = await statsRes.json()
          message = errorData.error || message
        } catch {
          // Keep the fallback message if the response is not JSON.
        }
        throw new Error(message)
      }

      const statsData = await statsRes.json()
      setStats(statsData.data)
    } catch (err: unknown) {
      console.error('[admin] Error fetching dashboard data:', err)
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to connect to the server',
      )
    } finally {
      setLoading(false)
    }
  }, [router])

useEffect(() => {
  let cancelled = false

  void Promise.resolve().then(() => {
    if (!cancelled) {
      return fetchData()
    }
  })

  return () => {
    cancelled = true
  }
}, [fetchData])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-centerbg-gray-50 dark:bg-slate-950">
        <div className="text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-red-600 border-r-transparent align-[-0.125em]" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading dashboard analytics...</p>
        </div>
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="flex h-screen items-center justify-centerbg-gray-50 dark:bg-slate-950 p-4">
        <div className="max-w-md rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Unable to load dashboard</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{error || 'Session could not be verified'}</p>
          <Button onClick={fetchData} className="w-full gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      </div>
    )
  }

  // Calculate dynamic low stock alerts based on configured thresholds
  const distribution = stats?.bloodGroupDistribution || []
  const criticalItems = distribution.filter((item) => item.unitsAvailable < criticalThreshold)
  const lowItems = distribution.filter(
    (item) => item.unitsAvailable >= criticalThreshold && item.unitsAvailable < lowThreshold
  )

  const requestStatsData = stats?.requestStats || [
    { status: 'Pending', count: stats?.pendingRequests || 0 },
    { status: 'Approved', count: stats?.approvedRequests || 0 },
    { status: 'Rejected', count: stats?.rejectedRequests || 0 },
  ]

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
            {/* Header & Threshold Controls */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">System Overview & Analytics</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Real-time blood stock monitoring, request distribution, and shortage alerts
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowThresholdConfig(!showThresholdConfig)}
                  className="gap-2 text-xs"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {showThresholdConfig ? 'Hide Thresholds' : 'Configure Alert Thresholds'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchData}
                  className="gap-1.5 text-xs"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
              </div>
            </div>

            {/* Configurable Threshold Settings Drawer / Card */}
            {showThresholdConfig && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs animate-in fade-in-50 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Inventory Alert Thresholds
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Adjust minimum units to trigger dashboard warning banners
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-medium text-red-700 dark:text-red-400">
                      Critical Shortage Threshold (&lt; units)
                    </label>
                    <Input
                      type="number"
                      min="1"
                      max="50"
                      value={criticalThreshold}
                      onChange={(e) =>
                        setCriticalThreshold(Math.max(1, parseInt(e.target.value) || 1))
                      }
                      className="mt-1 h-8 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Triggers high-priority emergency shortagebanner
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      Low Stock Buffer Threshold (&lt; units)
                    </label>
                    <Input
                      type="number"
                      min={criticalThreshold + 1}
                      max="100"
                      value={lowThreshold}
                      onChange={(e) =>
                        setLowThreshold(
                          Math.max(criticalThreshold + 1, parseInt(e.target.value) || 2)
                        )
                      }
                      className="mt-1 h-8 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      Triggers caution indicator for restocking
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Configurable Low-Stock Warning Banners */}
            {criticalItems.length > 0 && (
              <div className="flex items-start gap-3.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/40 p-4 sm:p-5 text-red-900 dark:text-red-200 shadow-xs animate-in fade-in-50">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-bold text-red-800 dark:text-red-300">
                    Critical Blood Shortage Alert ({criticalItems.length} blood {criticalItems.length === 1 ? 'group' : 'groups'} below{' '}
                    {criticalThreshold} units)
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-1">
                    The following blood groups have critically low reserves:
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {criticalItems.map((item) => (
                      <span
                        key={item.bloodGroup}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white shadow-xs"
                      >
                        {item.bloodGroup}: {item.unitsAvailable} {item.unitsAvailable === 1 ? 'unit' : 'units'}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {lowItems.length > 0 && (
              <div className="flex items-start gap-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/40 p-4 sm:p-5 text-amber-900 dark:text-amber-200 shadow-xs animate-in fade-in-50">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    Low Stock Buffer Notice ({lowItems.length} blood {lowItems.length === 1 ? 'group' : 'groups'} below {lowThreshold}{' '}
                    units)
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {lowItems.map((item) => (
                      <span
                        key={item.bloodGroup}
                        className="inline-flex items-center rounded-lg bg-amber-100 dark:bg-amber-900/60 border border-amber-300/80 dark:border-amber-800 px-2.5 py-1 text-xs font-semibold text-amber-900 dark:text-amber-200"
                      >
                        {item.bloodGroup}: {item.unitsAvailable} units
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Stats Metrics Cards */}
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-5">
              <StatsCard
                title="Registered Donors"
                value={stats?.donorCount || 0}
                icon={Users}
                color="blue"
              />
              <StatsCard
                title="Partner Hospitals"
                value={stats?.hospitalCount || 0}
                icon={Building2}
                color="green"
              />
              <StatsCard
                title="Pending Requests"
                value={stats?.pendingRequests || 0}
                icon={Clock}
                color="amber"
              />
              <StatsCard
                title="Approved Requests"
                value={stats?.approvedRequests || 0}
                icon={CheckCircle}
                color="green"
              />
              <StatsCard
                title="Total Stock Units"
                value={stats?.totalUnits || 0}
                icon={Droplets}
                color="red"
              />
            </div>

            {/* Interactive Recharts Analytics Component */}
            <AdminAnalyticsCharts
              stockData={distribution}
              requestStats={requestStatsData}
              criticalThreshold={criticalThreshold}
              lowThreshold={lowThreshold}
            />

            {/* Detailed Blood Stock Grid with Indicators */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 shadow-xs">
              <div className="flex items-center justify-betweenmb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Inventory Status by Group</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Live inventory units classified against configured safety thresholds
                  </p>
                </div>
                <a
                  href="/admin/blood-stock"
                  className="text-xs font-semibold text-red-600dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:underline"
                >
                  Manage Inventory &rarr;
                </a>
              </div>

              <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 xl:grid-cols-8">
                {distribution.map((item) => {
                  const isCritical = item.unitsAvailable < criticalThreshold
                  const isLow =
                    item.unitsAvailable >= criticalThreshold &&item.unitsAvailable < lowThreshold

                  return (
                    <div
                      key={item.bloodGroup}
                      className={`relative rounded-xl p-3.5 sm:p-4 text-center border transition-all hover:scale-[1.02] ${
                        isCritical
                          ? 'border-red-300 dark:border-red-900/60 bg-red-50/60 dark:bg-red-950/30'
                          : isLow
                            ? 'border-amber-300 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/30'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40'
                      }`}
                    >
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.bloodGroup}</p>
                      <p
                        className={`mt-2 text-2xl font-extrabold ${
                          isCritical
                            ? 'text-red-600 dark:text-red-400'
                            : isLow
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {item.unitsAvailable}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">units</p>

                      <div className="mt-2">
                        {isCritical ? (
                          <Badge className="bg-red-600 text-white text-[10px] px-1.5 py-0 h-4">
                            Critical
                          </Badge>
                        ) : isLow ? (
                          <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 h-4">
                            Low
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0 h-4 border-slate-300 dark:border-slate-700">
                            Adequate
                          </Badge>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Quick Action Navigation Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <a
                href="/admin/blood-stock"
                className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <div className="rounded-xl bg-red-50 dark:bg-red-950/60 p-2.5 text-red-600 dark:text-red-400 group-hover:bg-red-600 group-hover:text-white transition-colors">
                    <Droplets className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900dark:text-slate-100">Manage Blood Stock</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Update stock levels & replenishment</p>
                  </div>
                </div>
              </a>

              <a
                href="/admin/requests"
                className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/60 p-2.5 text-amber-600 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900dark:text-slate-100">Review Requests</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Search, filter & process hospital orders</p>
                  </div>
                </div>
              </a>

              <a
                href="/admin/users"
                className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-3.5">
                  <div className="rounded-xl bg-blue-50 dark:bg-blue-950/60 p-2.5 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900dark:text-slate-100">User Directory</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Manage donors and hospital accounts</p>
                  </div>
                </div>
              </a>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

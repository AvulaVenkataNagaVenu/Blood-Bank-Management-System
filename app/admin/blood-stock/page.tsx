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
import { Badge } from '@/components/ui/badge'
import {
  AlertCircle,
  Check,
  AlertTriangle,
  SlidersHorizontal,
  RefreshCw,
  Search,
  Filter,
} from 'lucide-react'

interface BloodStock {
  _id: string
  bloodGroup: string
  unitsAvailable: number
  lastUpdated: string
}

export default function BloodStockPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [stocks, setStocks] = useState<BloodStock[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ [key: string]: number }>({})
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Configurable stock thresholds
  const [criticalThreshold, setCriticalThreshold] = useState<number>(5)
  const [lowThreshold, setLowThreshold] = useState<number>(10)
  const [showConfig, setShowConfig] = useState(false)
  const [filterAlertsOnly, setFilterAlertsOnly] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      // 1. Check authentication
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

      // 2. Fetch blood stocks
      const stockRes = await fetch('/api/blood-stock')
      if (stockRes.ok) {
        const stockData = await stockRes.json()
        setStocks(stockData.data || [])
        // Initialize edit values
        const initialValues: { [key: string]: number } = {}
        ;(stockData.data || []).forEach((stock: BloodStock) => {
          initialValues[stock._id] = stock.unitsAvailable
        })
        setEditValues(initialValues)
      } else {
        setMessage({ type: 'error', text: 'Failed to retrieve blood inventory' })
      }
    } catch (error) {
      console.error('[stock] Error fetching data:', error)
      setMessage({ type: 'error', text: 'A network error occurred while connecting to the server' })
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

  const handleUpdateStock = async (stockId: string, bloodGroup: string) => {
    const rawVal = editValues[stockId]
    if (rawVal === undefined || isNaN(rawVal) || rawVal < 0) {
      setMessage({ type: 'error', text: 'Units available must be 0 or greater.' })
      return
    }

    setUpdating(stockId)
    setMessage(null)

    try {
      const response = await fetch('/api/blood-stock', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bloodGroup,
          unitsAvailable: Number(rawVal),
        }),
      })

      const data = await response.json()

      if (response.ok) {
        setStocks((prev) =>
          prev.map((stock) =>
            stock._id === stockId
              ? {
                  ...stock,
                  unitsAvailable: Number(rawVal),
                  lastUpdated: new Date().toISOString(),
                }
              : stock
          )
        )
        setMessage({
          type: 'success',
          text: `Blood stock for ${bloodGroup} updated to ${rawVal} units.`,
        })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to update stock' })
      }
    } catch (error) {
      console.error('[stock] Error updating stock:', error)
      setMessage({ type: 'error', text: 'An unexpected error occurred during update' })
    } finally {
      setUpdating(null)
    }
  }

  // Identify shortage groups based on configurable thresholds
  const criticalGroups = useMemo(
    () => stocks.filter((s) => s.unitsAvailable < criticalThreshold),
    [stocks, criticalThreshold]
  )

  const lowGroups = useMemo(
    () =>
      stocks.filter(
        (s) => s.unitsAvailable >= criticalThreshold && s.unitsAvailable < lowThreshold
      ),
    [stocks, criticalThreshold, lowThreshold]
  )

  const displayedStocks = useMemo(() => {
    if (filterAlertsOnly) {
      return stocks.filter((s) => s.unitsAvailable < lowThreshold)
    }
    return stocks
  }, [stocks, filterAlertsOnly, lowThreshold])

  const totalUnits = useMemo(
    () => stocks.reduce((sum, item) => sum + item.unitsAvailable, 0),
    [stocks]
  )

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-slate-950">
        <div className="text-center space-y-3">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-red-600 border-r-transparent" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading blood stock inventory...</p>
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
            {/* Page Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Blood Stock Inventory</h1>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Manage inventory levels, monitor shortages, and adjust safety thresholds
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowConfig(!showConfig)}
                  className="gap-2 text-xs"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {showConfig ? 'Hide Thresholds' : 'Configure Alert Limits'}
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

            {/* Configurable Threshold Drawer */}
            {showConfig && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 shadow-xs animate-in fade-in-50 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Inventory Alert Configuration
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Defines when inventory tags switch to Low and Critical
                  </span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold text-red-700 dark:text-red-400 block">
                      Critical Threshold (&lt; units)
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
                      Units below this number trigger red alert badges
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-amber-700 dark:text-amber-400 block">
                      Low Buffer Threshold (&lt; units)
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
                      Units below this number trigger amber caution badges
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Configurable Low-Stock Warning Banners */}
            {criticalGroups.length > 0 && (
              <div className="flex items-start gap-3.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/40 p-4 sm:p-5 text-red-900 dark:text-red-200 shadow-xs animate-in fade-in-50">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-bold text-red-800 dark:text-red-300">
                    Critical Shortage Alert ({criticalGroups.length} {criticalGroups.length === 1 ? 'group' : 'groups'} below {criticalThreshold} units)
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-400 mt-0.5">
                    Immediate donor bleeding or inventory transfer is recommended for:
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2.5">
                    {criticalGroups.map((item) => (
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

            {lowGroups.length > 0 && (
              <div className="flex items-start gap-3.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/80 dark:bg-amber-950/40 p-4 sm:p-5 text-amber-900 dark:text-amber-200 shadow-xs animate-in fade-in-50">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div className="flex-1 text-sm">
                  <p className="font-semibold text-amber-800 dark:text-amber-300">
                    Low Stock Notice ({lowGroups.length} {lowGroups.length === 1 ? 'group' : 'groups'} below buffer limit of {lowThreshold} units)
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {lowGroups.map((item) => (
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

            {/* Status Alert Message */}
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
                <span>{message.text}</span>
              </div>
            )}

            {/* Filter Toggle: All vs Shortages */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button
                  variant={filterAlertsOnly ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => setFilterAlertsOnly(false)}
                  className="text-xs h-8"
                >
                  All Blood Groups ({stocks.length})
                </Button>
                <Button
                  variant={filterAlertsOnly ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterAlertsOnly(true)}
                  className={`text-xs h-8 gap-1.5 ${
                    filterAlertsOnly ? 'bg-amber-600 hover:bg-amber-700' : ''
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                  Shortages Only ({criticalGroups.length + lowGroups.length})
                </Button>
              </div>

              <div className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                <span>Total Inventory:</span>
                <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-bold text-slate-900 dark:text-slate-100 text-sm">
                  {totalUnits} units
                </span>
              </div>
            </div>

            {/* Inventory Table */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <Table className="min-w-[720px]">
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-300 w-36">Blood Group</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-300 w-36">Current Units</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-300 w-44">Stock Status</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-300 w-48">Set New Units</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-300">Last Replenished</TableHead>
                      <TableHead className="font-semibold text-slate-700 dark:text-slate-300 text-right w-36">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedStocks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-36 text-center">
                          <div className="flex flex-col items-center justify-center space-y-2 text-slate-500 dark:text-slate-400">
                            <Check className="h-8 w-8 text-emerald-500" />
                            <p className="font-medium text-slate-800 dark:text-slate-200">No Stock Shortages Detected</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              All blood groups currently exceed the configured low-stock buffer threshold.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setFilterAlertsOnly(false)}
                              className="mt-2 text-xs"
                            >
                              View All Blood Groups
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedStocks.map((stock) => {
                        const isCritical = stock.unitsAvailable < criticalThreshold
                        const isLow =
                          stock.unitsAvailable >= criticalThreshold && stock.unitsAvailable < lowThreshold

                        return (
                          <TableRow
                            key={stock._id}
                            className={`transition-colors ${
                              isCritical
                                ? 'bg-red-50/40 hover:bg-red-50/70 dark:bg-red-950/20 dark:hover:bg-red-950/40'
                                : isLow
                                  ? 'bg-amber-50/30 hover:bg-amber-50/60 dark:bg-amber-950/20 dark:hover:bg-amber-950/40'
                                  : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <TableCell>
                              <span className="inline-flex items-center font-bold text-red-700 dark:text-red-300 bg-red-100/70 dark:bg-red-950/60 border border-red-200 dark:border-red-800 px-2.5 py-1 rounded-md text-sm">
                                {stock.bloodGroup}
                              </span>
                            </TableCell>

                            <TableCell>
                              <span
                                className={`text-lg font-extrabold ${
                                  isCritical
                                    ? 'text-red-600 dark:text-red-400'
                                    : isLow
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-slate-900 dark:text-slate-100'
                                }`}
                              >
                                {stock.unitsAvailable}
                              </span>
                              <span className="text-xs text-slate-500 dark:text-slate-400 ml-1">units</span>
                            </TableCell>

                            <TableCell>
                              {isCritical ? (
                                <Badge className="bg-red-600 text-white text-xs gap-1">
                                  <AlertTriangle className="h-3 w-3" /> Critical Shortage
                                </Badge>
                              ) : isLow ? (
                                <Badge className="bg-amber-500 text-white text-xs gap-1">
                                  <AlertCircle className="h-3 w-3" /> Low Buffer
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 text-xs gap-1">
                                  <Check className="h-3 w-3" /> Optimal
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min="0"
                                  max="100000"
                                  value={editValues[stock._id] ?? 0}
                                  onChange={(e) =>
                                    setEditValues((prev) => ({
                                      ...prev,
                                      [stock._id]: Math.max(0, parseInt(e.target.value) || 0),
                                    }))
                                  }
                                  className="w-24 h-8 text-sm bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                                />
                                <span className="text-xs text-slate-400 dark:text-slate-500">units</span>
                              </div>
                            </TableCell>

                            <TableCell className="text-xs text-slate-600 dark:text-slate-400">
                              {stock.lastUpdated
                                ? new Date(stock.lastUpdated).toLocaleDateString(undefined, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })
                                : 'Initial setup'}
                            </TableCell>

                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                onClick={() => handleUpdateStock(stock._id, stock.bloodGroup)}
                                disabled={updating === stock._id}
                                className="h-8 px-3 text-xs"
                              >
                                {updating === stock._id ? 'Saving...' : 'Update Stock'}
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

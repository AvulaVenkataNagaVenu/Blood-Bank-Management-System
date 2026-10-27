'use client'

import React from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Droplet, PieChart as PieChartIcon } from 'lucide-react'

interface BloodGroupStock {
  bloodGroup: string
  unitsAvailable: number
}

interface RequestStat {
  status: string
  count: number
}

interface StockChartProps {
  stockData: BloodGroupStock[]
  requestStats: RequestStat[]
  criticalThreshold?: number
  lowThreshold?: number
}

const REQUEST_COLORS: Record<string, string> = {
  Pending: '#f59e0b', // amber-500
  Approved: '#10b981', // emerald-500
  Rejected: '#ef4444', // red-500
}

export function AdminAnalyticsCharts({
  stockData,
  requestStats,
  criticalThreshold = 5,
  lowThreshold = 10,
}: StockChartProps) {
  // 1. Prepare Stock Bar Chart Data
  const barData = stockData.map((item) => {
    let statusLabel = 'Adequate'
    let fill = '#3b82f6' // Blue

    if (item.unitsAvailable < criticalThreshold) {
      statusLabel = 'Critical'
      fill = '#ef4444' // Red
    } else if (item.unitsAvailable < lowThreshold) {
      statusLabel = 'Low'
      fill = '#f59e0b' // Amber
    }

    return {
      bloodGroup: item.bloodGroup,
      units: item.unitsAvailable,
      status: statusLabel,
      fill,
    }
  })

  // 2. Prepare Request Pie Chart Data
  const pieData = requestStats
    .filter((item) => item.count > 0)
    .map((item) => ({
      name: item.status,
      value: item.count,
      color: REQUEST_COLORS[item.status] || '#94a3b8',
    }))

  const totalRequests = requestStats.reduce((sum, item) => sum + item.count, 0)

  return (
    <div className="grid gap-6 lg:grid-cols-7">
      {/* 1. Bar Chart: Blood Stock Inventory (4 cols) */}
      <Card className="lg:col-span-4 rounded-xl shadow-xs hover:shadow-sm transition-shadow border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg text-slate-900 dark:text-slate-100">
                <Droplet className="h-5 w-5 text-red-600 dark:text-red-500" />
                Live Stock Levels by Blood Group
              </CardTitle>
              <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
                Real-time units on hand with safety threshold indicators
              </CardDescription>
            </div>
            {/* Threshold Legend Chips */}
            <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs text-slate-600 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 shrink-0" />
                &lt;{criticalThreshold} Critical
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shrink-0" />
                &lt;{lowThreshold} Low
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0" />
                Optimal
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            {stockData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                No inventory data available
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" className="dark:stroke-slate-800" />
                  <XAxis
                    dataKey="bloodGroup"
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tick={{ fontSize: 12, fill: '#64748b', fontWeight: 600 }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={{ stroke: '#cbd5e1' }}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload
                        return (
                          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-md text-xs space-y-1">
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                              Blood Group: {data.bloodGroup}
                            </p>
                            <p className="text-slate-600 dark:text-slate-400">
                              Available Units:{' '}
                              <span className="font-semibold text-slate-900 dark:text-slate-100">{data.units}</span>
                            </p>
                            <p className="flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-400">
                              Status:{' '}
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  data.status === 'Critical'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                                    : data.status === 'Low'
                                      ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                                      : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                                }`}
                              >
                                {data.status}
                              </span>
                            </p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <ReferenceLine
                    y={lowThreshold}
                    stroke="#f59e0b"
                    strokeDasharray="4 4"
                    label={{
                      value: `Low buffer (${lowThreshold})`,
                      position: 'top',
                      fill: '#b45309',
                      fontSize: 10,
                    }}
                  />
                  <Bar dataKey="units" radius={[4, 4, 0, 0]}>
                    {barData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 2. Donut Chart: Request Status Breakdown (3 cols) */}
      <Card className="lg:col-span-3 rounded-xl shadow-xs hover:shadow-sm transition-shadow border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg text-slate-900 dark:text-slate-100">
            <PieChartIcon className="h-5 w-5 text-amber-600 dark:text-amber-500" />
            Request Status Analytics
          </CardTitle>
          <CardDescription className="text-xs text-slate-500 dark:text-slate-400">
            Resolution breakdown across {totalRequests} total requests
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full flex items-center justify-center">
            {totalRequests === 0 ? (
              <div className="text-center text-sm text-slate-500 dark:text-slate-400">
                <p className="font-medium text-slate-700 dark:text-slate-300">No requests recorded yet</p>
                <p className="text-xs mt-1 text-slate-400 dark:text-slate-500">
                  Requests submitted by hospitals will populate this chart
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`pie-cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0]
                        const count = data.value as number
                        const percent = ((count / totalRequests) * 100).toFixed(1)
                        return (
                          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2.5 shadow-md text-xs space-y-1">
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{data.name}</p>
                            <p className="text-slate-600 dark:text-slate-400">
                              Count: <span className="font-bold text-slate-900 dark:text-slate-100">{count}</span>
                            </p>
                            <p className="text-slate-500 dark:text-slate-400 text-[11px]">{percent}% of total</p>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value, entry: any) => {
                      const count = entry?.payload?.value ?? 0
                      return (
                        <span className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                          {value} ({count})
                        </span>
                      )
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import { connectDB } from '@/lib/db'

export const dynamic = 'force-dynamic'

interface HealthResponse {
  status: 'healthy' | 'unhealthy'
  database: 'connected' | 'disconnected'
  uptime: number
  timestamp: string
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  let isDbConnected = false

  try {
    await connectDB()
    // readyState 1 indicates Mongoose connection is active and ready
    isDbConnected = mongoose.connection.readyState === 1
  } catch {
    // Fail closed without leaking internal errors, connection strings, or stack traces
    isDbConnected = false
  }

  const uptimeSeconds = Math.floor(process.uptime())
  const timestamp = new Date().toISOString()

  if (!isDbConnected) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        database: 'disconnected',
        uptime: uptimeSeconds,
        timestamp,
      },
      { status: 503 }
    )
  }

  return NextResponse.json(
    {
      status: 'healthy',
      database: 'connected',
      uptime: uptimeSeconds,
      timestamp,
    },
    { status: 200 }
  )
}

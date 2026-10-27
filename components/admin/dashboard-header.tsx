'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { NotificationBell } from '@/components/notifications/notification-bell'
import { ThemeToggle } from '@/components/theme-toggle'
import { LogOut, Menu, Droplets } from 'lucide-react'
import { useState } from 'react'

interface DashboardHeaderProps {
  userName: string
  onMenuClick?: () => void
}

export function DashboardHeader({ userName, onMenuClick }: DashboardHeaderProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleLogout = async () => {
    setLoading(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
    } catch (error) {
      console.error('[admin] Logout error:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-xs transition-colors shrink-0">
      <div className="flex h-full w-full max-w-[1600px] mx-auto items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-10">
        <div className="flex items-center gap-3">
          {onMenuClick && (
            <button
              type="button"
              onClick={onMenuClick}
              aria-label="Open sidebar menu"
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 lg:hidden cursor-pointer transition-colors"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white shadow-xs">
              <Droplets className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">
                  Blood Bank
                </span>
                <span className="hidden sm:inline-flex items-center rounded-full bg-red-100 dark:bg-red-950/60 px-2 py-0.2 text-[10px] font-bold text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                  Admin
                </span>
              </div>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Management System
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <NotificationBell />
          <div className="hidden text-right sm:block">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[150px] md:max-w-[180px] leading-snug">
              {userName}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Administrator
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            disabled={loading}
            aria-label="Log out of session"
            className="gap-1.5 h-9 text-xs font-medium border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 focus-visible:ring-2 focus-visible:ring-red-500 cursor-pointer transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{loading ? 'Logging out...' : 'Logout'}</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

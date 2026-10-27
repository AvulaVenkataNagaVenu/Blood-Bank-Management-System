'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Droplets, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationBell } from '@/components/notifications/notification-bell'

export interface PortalHeaderProps {
  portalName: string
  userName: string
  userSubtitle?: string
  roleBadgeText?: string
  onLogout?: () => Promise<void> | void
}

export function PortalHeader({
  portalName,
  userName,
  userSubtitle,
  roleBadgeText,
  onLogout,
}: PortalHeaderProps) {
  const router = useRouter()
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    if (onLogout) {
      setLoggingOut(true)
      try {
        await onLogout()
      } finally {
        setLoggingOut(false)
      }
      return
    }

    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      router.push('/')
    } catch (error) {
      console.error('[auth] Logout error:', error)
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <header className="sticky top-0 z-30 h-16 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs shadow-xs transition-colors shrink-0">
      <div className="mx-auto flex h-full w-full max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8 xl:px-10">
        {/* Brand identity */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white shadow-xs">
            <Droplets className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 leading-tight">
                Blood Bank
              </span>
              {roleBadgeText && (
                <span className="hidden sm:inline-flex items-center rounded-full bg-red-100 dark:bg-red-950/60 px-2 py-0.2 text-[10px] font-bold text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                  {roleBadgeText}
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {portalName}
            </p>
          </div>
        </div>

        {/* Action group */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          <NotificationBell />

          {/* User profile info snippet */}
          <div className="hidden sm:block text-right">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate max-w-[150px] md:max-w-[180px] leading-snug">
              {userName}
            </p>
            {userSubtitle && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[150px] md:max-w-[180px]">
                {userSubtitle}
              </p>
            )}
          </div>

          {/* Standardized logout button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            disabled={loggingOut}
            aria-label="Log out of session"
            className="gap-1.5 h-9 text-xs font-medium border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 focus-visible:ring-2 focus-visible:ring-red-500 cursor-pointer transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">{loggingOut ? 'Logging out...' : 'Logout'}</span>
          </Button>
        </div>
      </div>
    </header>
  )
}

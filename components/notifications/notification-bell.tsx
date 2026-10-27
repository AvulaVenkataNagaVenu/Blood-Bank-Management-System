'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import {
  Bell,
  Check,
  CheckCheck,
  AlertTriangle,
  AlertCircle,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Notification } from '@/lib/types'

function formatNotificationTime(dateInput?: Date | string): string {
  if (!dateInput) return ''
  const date = new Date(dateInput)
  if (isNaN(date.getTime())) return ''

  const now = new Date()
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffSec < 60) return 'Just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 172800) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getPriorityBadge(priority?: string) {
  switch (priority) {
    case 'Emergency':
      return (
        <Badge
          variant="destructive"
          className="gap-1 text-[10px] font-bold px-1.5 py-0 h-4 uppercase tracking-wider animate-pulse"
        >
          <AlertCircle className="h-2.5 w-2.5" /> Emergency
        </Badge>
      )
    case 'High':
      return (
        <Badge className="bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-100 gap-1 text-[10px] font-semibold px-1.5 py-0 h-4">
          <AlertTriangle className="h-2.5 w-2.5" /> High
        </Badge>
      )
    default:
      return null
  }
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState<number>(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [markingAll, setMarkingAll] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isFetchingCount = useRef(false)
  const isFetchingList = useRef(false)

  // 1. Fetch unread notification count
  const fetchUnreadCount = useCallback(async () => {
    if (isFetchingCount.current) return
    isFetchingCount.current = true
    try {
      const res = await fetch('/api/notifications/unread-count')
      if (res.ok) {
        const json = await res.json()
        if (json.success && typeof json.data?.unreadCount === 'number') {
          setUnreadCount(json.data.unreadCount)
        }
      }
    } catch {
      // Non-blocking: fail silently on background poll error
    } finally {
      isFetchingCount.current = false
    }
  }, [])

  // 2. Fetch full notification list
  const fetchNotifications = useCallback(async () => {
    if (isFetchingList.current) return
    isFetchingList.current = true
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/notifications?limit=30')
      if (res.ok) {
        const json = await res.json()
        if (json.success && Array.isArray(json.data)) {
          setNotifications(json.data)
        }
      } else {
        setError('Failed to load notifications')
      }
    } catch {
      setError('Network error loading notifications')
    } finally {
      setLoading(false)
      isFetchingList.current = false
    }
  }, [])

  // Periodic polling for unread count (every 30 seconds)
useEffect(() => {
  const initialFetch = window.setTimeout(() => {
    void fetchUnreadCount()
  }, 0)

  const interval = window.setInterval(() => {
    void fetchUnreadCount()
  }, 30000)

  return () => {
    window.clearTimeout(initialFetch)
    window.clearInterval(interval)
  }
}, [fetchUnreadCount])

  // When popover opens, refresh notifications & count
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open)
    if (open) {
      fetchNotifications()
      fetchUnreadCount()
    }
  }

  // Mark a single notification as read
  const handleMarkOneRead = async (id?: string) => {
    if (!id) return
    // Optimistic UI update
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, isRead: true, readAt: new Date() } : n))
    )
    setUnreadCount((c) => Math.max(0, c - 1))

    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
      if (!res.ok) {
        // Revert or refresh on failure
        fetchUnreadCount()
        fetchNotifications()
      }
    } catch {
      fetchUnreadCount()
    }
  }

  // Mark all notifications as read
  const handleMarkAllRead = async () => {
    if (unreadCount === 0 || markingAll) return
    setMarkingAll(true)
    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date() })))
    setUnreadCount(0)

    try {
      const res = await fetch('/api/notifications/mark-all-read', { method: 'PATCH' })
      if (!res.ok) {
        fetchUnreadCount()
        fetchNotifications()
      }
    } catch {
      fetchUnreadCount()
    } finally {
      setMarkingAll(false)
    }
  }

  const badgeDisplay = unreadCount > 99 ? '99+' : unreadCount.toString()

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications (${unreadCount} unread)`}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-slate-950 transition-colors cursor-pointer"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white shadow-xs ring-2 ring-white dark:ring-slate-900"
              aria-hidden="true"
            >
              {badgeDisplay}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 sm:w-96 p-0 shadow-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-xl overflow-hidden z-50"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/90 px-4 py-3">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100">Notifications</h3>
            {unreadCount > 0 && (
              <span className="rounded-full bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 px-2 py-0.5 text-xs font-bold">
                {unreadCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                disabled={markingAll}
                className="h-7 text-xs text-slate-600 dark:text-slate-400 hover:text-red-700 dark:hover:text-red-400 px-2 gap-1 cursor-pointer"
                title="Mark all notifications as read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Mark all read</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchNotifications}
              disabled={loading}
              className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer"
              title="Refresh notifications"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div>
          {loading && notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-red-600 mb-2" />
              <p className="text-xs text-slate-500 font-medium">Loading notifications...</p>
            </div>
          ) : error && notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <AlertCircle className="h-6 w-6 text-red-500 mb-2" />
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchNotifications}
                className="mt-3 h-7 text-xs cursor-pointer"
              >
                Retry
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-2">
                <Bell className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200">No notifications yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                We will notify you when blood requests, appointments, or stock updates occur.
              </p>
            </div>
          ) : (
            <ScrollArea className="h-[360px]">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.map((notif) => {
                  const isUnread = !notif.isRead
                  return (
                    <div
                      key={notif._id?.toString() || notif.eventKey}
                      className={`group relative flex items-start gap-3 p-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 ${
                        isUnread ? 'bg-red-50/30 dark:bg-red-950/20' : 'bg-white dark:bg-slate-900'
                      }`}
                    >
                      {/* Priority / Type Indicator Icon */}
                      <div className="mt-0.5 flex-shrink-0">
                        {notif.priority === 'Emergency' ? (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400">
                            <AlertCircle className="h-4 w-4" />
                          </div>
                        ) : notif.priority === 'High' ? (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                            <AlertTriangle className="h-4 w-4" />
                          </div>
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            <Info className="h-4 w-4" />
                          </div>
                        )}
                      </div>

                      {/* Notification Body */}
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p
                            className={`text-xs ${
                              isUnread ? 'font-bold text-slate-900 dark:text-slate-100' : 'font-medium text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {notif.title}
                          </p>
                          {getPriorityBadge(notif.priority)}
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                          {notif.message}
                        </p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1.5 font-medium">
                          {formatNotificationTime(notif.createdAt)}
                        </p>
                      </div>

                      {/* Unread dot / Mark read control */}
                      <div className="absolute top-3.5 right-3 flex items-center gap-1">
                        {isUnread && (
                          <button
                            type="button"
                            onClick={() => handleMarkOneRead(notif._id?.toString())}
                            className="rounded p-1 text-slate-400 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title="Mark as read"
                            aria-label="Mark notification as read"
                          >
                            <span className="block h-2 w-2 rounded-full bg-red-600 group-hover:hidden" />
                            <Check className="h-3.5 w-3.5 hidden group-hover:block" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

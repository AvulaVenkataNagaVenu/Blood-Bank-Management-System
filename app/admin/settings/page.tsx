
'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import {
  ShieldCheck,
  KeyRound,
  Mail,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { Sidebar } from '@/components/admin/sidebar'

export default function AdminSettingsPage() {
  const router = useRouter()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setMessage('')
    setMessageType('')

    if (
      !currentPassword ||
      !newEmail.trim() ||
      !newPassword ||
      !confirmPassword
    ) {
      setMessage('Please complete all fields.')
      setMessageType('error')
      return
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      setMessage('Your new password must be between 8 and 128 characters.')
      setMessageType('error')
      return
    }

    if (newPassword !== confirmPassword) {
      setMessage('The new password and confirmation do not match.')
      setMessageType('error')
      return
    }

    setIsSaving(true)

    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          currentPassword,
          newEmail: newEmail.trim(),
          newPassword,
          confirmPassword,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        setMessage(result.error || 'Unable to update credentials.')
        setMessageType('error')
        return
      }

      setMessage(
        'Your Admin email and password have been updated successfully.'
      )
      setMessageType('success')

      setCurrentPassword('')
      setNewEmail('')
      setNewPassword('')
      setConfirmPassword('')

      // Refresh server-rendered content using the new session cookie.
      router.refresh()
    } catch {
      setMessage(
        'Could not contact the server. Check that your application is running and try again.'
      )
      setMessageType('error')
    } finally {
      setIsSaving(false)
    }
  }

  const inputClass =
    'mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-red-500 dark:focus:ring-red-950'

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="min-w-0 flex-1">
        <header className="flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-5 dark:border-slate-800 dark:bg-slate-900 sm:px-8">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open admin navigation"
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 lg:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>

          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              Admin Settings
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Account and security
            </p>
          </div>
        </header>

        <div className="mx-auto w-full max-w-4xl p-5 sm:p-8">
          <div className="mb-7">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
              <ShieldCheck className="h-6 w-6" />
            </div>

            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Secure your Admin account
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-400">
              Change your Admin login email and password. You must confirm
              your current password before the changes can be saved.
            </p>
          </div>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4 dark:border-slate-800 sm:px-7">
              <KeyRound className="h-5 w-5 text-red-600 dark:text-red-400" />
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-white">
                  Login credentials
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  All fields are required.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 p-5 sm:p-7">
              <div>
                <label
                  htmlFor="currentPassword"
                  className="text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  Current password
                </label>
                <input
                  id="currentPassword"
                  name="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={128}
                  value={currentPassword}
                  onChange={(event) =>
                    setCurrentPassword(event.target.value)
                  }
                  className={inputClass}
                  placeholder="Enter your current password"
                />
              </div>

              <div>
                <label
                  htmlFor="newEmail"
                  className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  <Mail className="h-4 w-4" />
                  New login email
                </label>
                <input
                  id="newEmail"
                  name="newEmail"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  className={inputClass}
                  placeholder="Enter your new email address"
                />
              </div>

              <div>
                <label
                  htmlFor="newPassword"
                  className="text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  New password
                </label>
                <input
                  id="newPassword"
                  name="newPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  className={inputClass}
                  placeholder="Create a new password"
                />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Use at least 8 characters and choose a password you have not
                  used before.
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="text-sm font-medium text-slate-800 dark:text-slate-200"
                >
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  className={inputClass}
                  placeholder="Re-enter your new password"
                />
              </div>

              {message && (
                <div
                  role="status"
                  aria-live="polite"
                  className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                    messageType === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300'
                      : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
                  }`}
                >
                  {messageType === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span>{message}</span>
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">
                  Your existing Admin account will be updated in place.
                </p>

                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-900"
                >
                  {isSaving && (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  )}
                  {isSaving ? 'Updating credentials…' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>

          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            <strong>Security reminder:</strong> Never share your current or
            new password. If the update fails, your existing credentials
            should remain unchanged.
          </div>
        </div>
      </main>
    </div>
  )
}

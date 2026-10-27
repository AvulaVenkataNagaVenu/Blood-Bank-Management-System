
import { LoginForm } from '@/components/auth/login-form'
import { ThemeToggle } from '@/components/theme-toggle'
import { Droplet, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4 transition-colors dark:from-slate-950 dark:to-slate-900">
      <Link
        href="/"
        className="absolute left-4 top-4 inline-flex items-center gap-2 text-sm text-slate-600 transition hover:text-red-600 dark:text-slate-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>

      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-red-600">
            <Droplet className="h-6 w-6 text-white" />
          </div>

          <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
            Blood Bank
          </h1>

          <p className="mt-2 text-slate-600 dark:text-slate-400">
            Management System
          </p>
        </div>

        <LoginForm />

        <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          New to our platform?{' '}
          <Link
            href="/register"
            className="font-medium text-red-600 hover:underline dark:text-red-400"
          >
            Create an account
          </Link>
        </p>
      </div>
    </main>
  )
}

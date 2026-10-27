
import Link from 'next/link'
import {
  Droplet,
  Heart,
  ShieldCheck,
  Activity,
  ArrowRight,
  Clock,
  Users,
  Hospital,
  HandHeart,
  Menu,
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

const features = [
  {
    icon: Droplet,
    title: 'Blood Inventory',
    description:
      'Support organized blood-stock management and visibility for authorized users.',
  },
  {
    icon: Users,
    title: 'Donor Management',
    description:
      'Register as a donor and manage your donation details in one place.',
  },
  {
    icon: Hospital,
    title: 'Hospital Requests',
    description:
      'Enable hospitals to submit blood requests and follow their request status.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-Based Access',
    description:
      'Separate access for administrators, donors, and hospitals.',
  },
]

const steps = [
  {
    number: '01',
    title: 'Create an account',
    description: 'Register as a blood donor or hospital.',
  },
  {
    number: '02',
    title: 'Manage your activity',
    description: 'Use your account to access the features available for your role.',
  },
  {
    number: '03',
    title: 'Support blood availability',
    description: 'Help coordinate donations, inventory, and hospital requests.',
  },
]

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/90">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white shadow-lg shadow-red-600/20">
              <Droplet className="h-6 w-6 fill-current" />
            </span>
            <span>
              <span className="block text-lg font-bold tracking-tight">
                Life<span className="text-red-600">Flow</span>
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">
                Blood Bank Management
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <a href="#features" className="text-sm text-slate-600 hover:text-red-600 dark:text-slate-300">
              Features
            </a>
            <a href="#how-it-works" className="text-sm text-slate-600 hover:text-red-600 dark:text-slate-300">
              How it works
            </a>
            <a href="#about" className="text-sm text-slate-600 hover:text-red-600 dark:text-slate-300">
              About
            </a>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Link
              href="/login"
              className="hidden rounded-lg px-4 py-2 text-sm font-semibold transition hover:bg-slate-100 dark:hover:bg-slate-800 sm:inline-flex"
            >
              Log in
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-700"
            >
              Get started
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative isolate">
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-red-50 via-white to-rose-50 dark:from-red-950/30 dark:via-slate-950 dark:to-slate-900" />
        <div className="absolute right-0 top-0 -z-10 h-96 w-96 rounded-full bg-red-200/30 blur-3xl dark:bg-red-700/10" />

        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-2">
          <div>
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-red-200 bg-white/80 px-4 py-2 text-sm font-medium text-red-700 dark:border-red-900 dark:bg-slate-900/80 dark:text-red-300">
              <Heart className="h-4 w-4 fill-current" />
              Every donation can make a difference
            </div>

            <h1 className="max-w-2xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Give blood.
              <span className="block text-red-600">Share life.</span>
              <span className="block text-slate-800 dark:text-slate-100">
                Build hope.
              </span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 dark:text-slate-300">
              A centralized platform designed to help donors, hospitals, and
              administrators coordinate blood donations, manage inventory,
              and track blood requests.
            </p>

            <div className="mt-9 flex flex-wrap gap-4">
              <Link
                href="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3.5 font-semibold text-white shadow-xl shadow-red-600/20 transition hover:-translate-y-0.5 hover:bg-red-700"
              >
                <HandHeart className="h-5 w-5" />
                Become a donor
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 font-semibold text-slate-800 transition hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                Access your account
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-green-600" />
                Role-based access
              </span>
              <span className="inline-flex items-center gap-2">
                <Activity className="h-4 w-4 text-red-600" />
                Organized inventory
              </span>
              <span className="inline-flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                Request tracking
              </span>
            </div>
          </div>

          {/* Decorative blood-drop illustration */}
          <div className="relative mx-auto flex w-full max-w-lg items-center justify-center py-8">
            <div className="absolute h-72 w-72 rounded-full border border-red-200 dark:border-red-900/60 sm:h-96 sm:w-96" />
            <div className="absolute h-60 w-60 rounded-full border border-dashed border-red-300 dark:border-red-800 sm:h-80 sm:w-80" />

            <div className="relative flex h-64 w-64 items-center justify-center rounded-[3rem] bg-gradient-to-br from-red-500 to-rose-700 shadow-2xl shadow-red-600/30 sm:h-80 sm:w-80">
              <Droplet className="h-40 w-40 fill-white text-white sm:h-52 sm:w-52" strokeWidth={1.1} />
              <div className="absolute bottom-5 right-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/40 bg-white/20 text-white backdrop-blur-md sm:bottom-8 sm:right-6">
                <Heart className="h-8 w-8 fill-current" />
              </div>
            </div>

            <div className="absolute left-0 top-10 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:left-2">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-bold">Secure access</span>
                  <span className="block text-xs text-slate-500">Role-based accounts</span>
                </span>
              </div>
            </div>

            <div className="absolute bottom-8 right-0 rounded-2xl border border-slate-100 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900 sm:right-0">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                  <Heart className="h-5 w-5 fill-current" />
                </span>
                <span>
                  <span className="block text-sm font-bold">One community</span>
                  <span className="block text-xs text-slate-500">Donors and hospitals</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-600">
              One connected platform
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Tools that bring the process together
            </h2>
            <p className="mt-5 leading-7 text-slate-600 dark:text-slate-300">
              Designed to support the key activities involved in coordinating
              donors, blood inventory, and hospital requests.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => {
              const Icon = feature.icon

              return (
                <article
                  key={feature.title}
                  className="group rounded-2xl border border-slate-200 bg-white p-6 transition duration-300 hover:-translate-y-1 hover:border-red-200 hover:shadow-xl hover:shadow-red-950/5 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-red-900"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600 transition group-hover:bg-red-600 group-hover:text-white dark:bg-red-950/60 dark:text-red-300">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-6 text-lg font-bold">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    {feature.description}
                  </p>
                </article>
              )
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section
        id="how-it-works"
        className="border-y border-slate-200 bg-slate-50 py-20 dark:border-slate-800 dark:bg-slate-900/50 sm:py-24"
      >
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-red-600">
              Getting started
            </p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
              A simpler way to connect
            </h2>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {steps.map((step) => (
              <article
                key={step.number}
                className="relative rounded-2xl border border-slate-200 bg-white p-7 dark:border-slate-800 dark:bg-slate-950"
              >
                <span className="text-sm font-extrabold tracking-widest text-red-600">
                  STEP {step.number}
                </span>
                <h3 className="mt-4 text-xl font-bold">{step.title}</h3>
                <p className="mt-3 leading-7 text-slate-600 dark:text-slate-300">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* About and CTA */}
      <section id="about" className="py-20 sm:py-24">
        <div className="mx-auto max-w-5xl px-5 sm:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-red-600 to-rose-700 px-7 py-12 text-center text-white shadow-2xl shadow-red-700/20 sm:px-14 sm:py-16">
            <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full border-[30px] border-white/10" />
            <div className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full border-[35px] border-white/10" />

            <div className="relative">
              <Heart className="mx-auto h-10 w-10 fill-current" />
              <h2 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">
                Be part of something meaningful
              </h2>
              <p className="mx-auto mt-5 max-w-2xl leading-7 text-red-50">
                Create an account to access the features available to your role
                and help support better coordination between donors and hospitals.
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-4">
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 font-bold text-red-700 transition hover:bg-red-50"
                >
                  Create an account
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-xl border border-white/50 px-6 py-3.5 font-semibold text-white transition hover:bg-white/10"
                >
                  Log in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 text-sm text-slate-500 dark:text-slate-400 sm:px-8 md:flex-row md:items-center md:justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-100">
            <Droplet className="h-5 w-5 text-red-600" />
            LifeFlow Blood Bank
          </Link>
          <p>Blood donation coordination and inventory management.</p>
          <div className="flex gap-5">
            <Link href="/login" className="hover:text-red-600">
              Login
            </Link>
            <Link href="/register" className="hover:text-red-600">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}

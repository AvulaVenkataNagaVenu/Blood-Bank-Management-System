
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'

const BLOOD_GROUPS = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

const PASSWORD_RULES = [
  {
    label: 'At least 8 characters',
    test: (password: string) => password.length >= 8,
  },
  {
    label: 'An uppercase letter (A–Z)',
    test: (password: string) => /[A-Z]/.test(password),
  },
  {
    label: 'A lowercase letter (a–z)',
    test: (password: string) => /[a-z]/.test(password),
  },
  {
    label: 'A number (0–9)',
    test: (password: string) => /[0-9]/.test(password),
  },
  {
    label: 'A special character',
    test: (password: string) => /[^A-Za-z0-9]/.test(password),
  },
]

export function RegisterForm() {
  const router = useRouter()

  const [role, setRole] = useState('Donor')

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    bloodGroup: '',
    phone: '',
    hospitalName: '',
  })

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const passwordChecks = PASSWORD_RULES.map((rule) =>
    rule.test(formData.password)
  )

  const passwordStrength = passwordChecks.filter(Boolean).length

  const strengthLabel = [
    'Very weak',
    'Very weak',
    'Weak',
    'Fair',
    'Strong',
    'Very strong',
  ][passwordStrength]

  const strengthColor =
    passwordStrength <= 2
      ? 'bg-red-500'
      : passwordStrength === 3
        ? 'bg-yellow-500'
        : passwordStrength === 4
          ? 'bg-blue-500'
          : 'bg-green-500'

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))

    setError('')
  }

  const handleRoleChange = (value: string) => {
    setRole(value)

    setFormData((prev) => ({
      ...prev,
      bloodGroup: '',
      hospitalName: '',
    }))

    setError('')
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    if (loading) return

    if (!formData.name.trim() || formData.name.trim().length < 2) {
      setError('Please enter your full name (at least 2 characters).')
      return
    }

    const normalizedEmail = formData.email.trim().toLowerCase()

    if (
      normalizedEmail.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      /@(example\.com|example\.org|example\.net|test\.com|invalid|localhost)$/i.test(
        normalizedEmail
      )
    ) {
      setError('Please enter a valid email address.')
      return
    }

    if (formData.password.length > 128 || passwordStrength < 5) {
      setError(
        'Your password must contain 8–128 characters, including uppercase and lowercase letters, a number, and a special character.'
      )
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (role === 'Donor' && !formData.bloodGroup) {
      setError('Blood group is required for donors.')
      return
    }

    if (role === 'Hospital' && !formData.hospitalName.trim()) {
      setError('Hospital name is required.')
      return
    }

    setLoading(true)

    try {
      const payload: {
        name: string
        email: string
        password: string
        role: string
        bloodGroup?: string
        phone?: string
        hospitalName?: string
      } = {
        name: formData.name.trim(),
        email: normalizedEmail,
        password: formData.password,
        role,
      }

      if (role === 'Donor') {
        payload.bloodGroup = formData.bloodGroup
        payload.phone = formData.phone.trim()
      }

      if (role === 'Hospital') {
        payload.hospitalName = formData.hospitalName.trim()
        payload.phone = formData.phone.trim()
      }

      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Registration failed. Please try again.')
        return
      }

      const user = data.data

      if (user?.role === 'Donor') {
        router.push('/donor')
      } else if (user?.role === 'Hospital') {
        router.push('/hospital')
      } else {
        // Public registration must never create an Admin account.
        router.push('/login')
      }

      router.refresh()
    } catch (err) {
      console.error('Registration error:', err)
      setError('Unable to complete registration. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Create Account</CardTitle>
        <CardDescription>
          Register for Blood Bank Management System
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* User role */}
          <div className="space-y-2">
            <label htmlFor="role" className="text-sm font-medium">
              User Type
            </label>

            <Select value={role} onValueChange={handleRoleChange}>
              <SelectTrigger id="role">
                <SelectValue placeholder="Select user type" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="Donor">Blood Donor</SelectItem>
                <SelectItem value="Hospital">Hospital</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Full name */}
          <div className="space-y-2">
            <label htmlFor="register-name" className="text-sm font-medium">
              Full Name
            </label>

            <Input
              id="register-name"
              name="name"
              type="text"
              autoComplete="name"
              placeholder="Enter your full name"
              value={formData.name}
              onChange={handleChange}
              minLength={2}
              maxLength={100}
              required
            />
          </div>

          {/* Email */}
          <div className="space-y-2">
            <label htmlFor="register-email" className="text-sm font-medium">
              Email Address
            </label>

            <Input
              id="register-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="Enter your email address"
              value={formData.email}
              onChange={handleChange}
              maxLength={254}
              required
            />
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <label htmlFor="register-phone" className="text-sm font-medium">
              Phone Number
            </label>

            <Input
              id="register-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              placeholder="Enter your phone number"
              value={formData.phone}
              onChange={handleChange}
              maxLength={20}
            />
          </div>

          {/* Donor blood group */}
          {role === 'Donor' && (
            <div className="space-y-2">
              <label htmlFor="bloodGroup" className="text-sm font-medium">
                Blood Group
              </label>

              <Select
                value={formData.bloodGroup}
                onValueChange={(value) => {
                  setFormData((prev) => ({
                    ...prev,
                    bloodGroup: value,
                  }))
                  setError('')
                }}
              >
                <SelectTrigger id="bloodGroup">
                  <SelectValue placeholder="Select blood group" />
                </SelectTrigger>

                <SelectContent>
                  {BLOOD_GROUPS.map((bloodGroup) => (
                    <SelectItem key={bloodGroup} value={bloodGroup}>
                      {bloodGroup}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Hospital name */}
          {role === 'Hospital' && (
            <div className="space-y-2">
              <label htmlFor="hospitalName" className="text-sm font-medium">
                Hospital Name
              </label>

              <Input
                id="hospitalName"
                name="hospitalName"
                type="text"
                placeholder="Enter hospital name"
                value={formData.hospitalName}
                onChange={handleChange}
                maxLength={150}
                required
              />
            </div>
          )}

          {/* Password with visibility toggle */}
          <div className="space-y-2">
            <label htmlFor="register-password" className="text-sm font-medium">
              Password
            </label>

            <div className="relative">
              <Input
                id="register-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Create a strong password"
                value={formData.password}
                onChange={handleChange}
                maxLength={128}
                className="pr-11"
                required
                aria-describedby="password-strength"
              />

              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {formData.password.length > 0 && (
              <div
                id="password-strength"
                className="space-y-2"
                aria-live="polite"
              >
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                  role="progressbar"
                  aria-label="Password strength"
                  aria-valuemin={0}
                  aria-valuemax={5}
                  aria-valuenow={passwordStrength}
                >
                  <div
                    className={`h-full rounded-full transition-all ${strengthColor}`}
                    style={{
                      width: `${(passwordStrength / 5) * 100}%`,
                    }}
                  />
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Password strength:{' '}
                  <span className="font-medium">{strengthLabel}</span>
                </p>

                <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                  {PASSWORD_RULES.map((rule, index) => (
                    <li key={rule.label}>
                      <span
                        className={
                          passwordChecks[index]
                            ? 'font-medium text-green-600 dark:text-green-400'
                            : ''
                        }
                      >
                        {passwordChecks[index] ? '✓' : '○'} {rule.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Confirm password with visibility toggle */}
          <div className="space-y-2">
            <label
              htmlFor="confirmPassword"
              className="text-sm font-medium"
            >
              Confirm Password
            </label>

            <div className="relative">
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Re-enter your password"
                value={formData.confirmPassword}
                onChange={handleChange}
                maxLength={128}
                className="pr-11"
                required
              />

              <button
                type="button"
                onClick={() =>
                  setShowConfirmPassword((visible) => !visible)
                }
                className="absolute inset-y-0 right-0 flex items-center justify-center px-3 text-muted-foreground hover:text-foreground"
                aria-label={
                  showConfirmPassword ? 'Hide password' : 'Show password'
                }
                aria-pressed={showConfirmPassword}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>

            {formData.confirmPassword.length > 0 && (
              <p
                className={`text-xs ${
                  formData.password === formData.confirmPassword
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formData.password === formData.confirmPassword
                  ? 'Passwords match'
                  : 'Passwords do not match'}
              </p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Creating account...' : 'Create Account'}
          </Button>

          <p className="text-center text-sm text-slate-600 dark:text-slate-400">
            Already have an account?{' '}
            <a
              href="/login"
              className="font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              Login here
            </a>
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardHeader } from '@/components/admin/dashboard-header'
import { Sidebar } from '@/components/admin/sidebar'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

interface User {
  _id: string
  name: string
  email: string
  role: 'Admin' | 'Donor' | 'Hospital'
  bloodGroup?: string
  hospitalName?: string
  phone?: string
  createdAt: string
}

export default function UsersPage() {
  const router = useRouter()

  const [user, setUser] = useState<any>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  // Use "all" instead of an empty string.
  // Empty string is not allowed as a SelectItem value.
  const [roleFilter, setRoleFilter] = useState<string>('all')

  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Check authentication
        const userRes = await fetch('/api/auth/me')

        if (!userRes.ok) {
          router.push('/')
          return
        }

        const userData = await userRes.json()

        // Check admin role
        if (userData.data?.role !== 'Admin') {
          router.push('/')
          return
        }

        setUser(userData.data)

        // Fetch users
        const usersRes = await fetch('/api/users')

        if (usersRes.ok) {
          const usersData = await usersRes.json()
          setUsers(usersData.data)
        }
      } catch (error) {
        console.error('Error fetching data:', error)
        router.push('/')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [router])

  // Filter users based on selected role
  // "all" means show every user.
  const filteredUsers =
    roleFilter === 'all'
      ? users
      : users.filter((u) => u.role === roleFilter)

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'Admin':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 dark:border dark:border-purple-800'

      case 'Donor':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 dark:border dark:border-blue-800'

      case 'Hospital':
        return 'bg-green-100 text-green-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-800'

      default:
        return 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300'
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400">
        Loading...
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-950 transition-colors">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

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
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  User Directory
                </h1>

                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Manage registered blood donors, hospital accounts, and administrative users
                </p>
              </div>

              {/* Role Filter */}
              <div className="w-40">
                <Select
                  value={roleFilter}
                  onValueChange={setRoleFilter}
                >
                  <SelectTrigger className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>

                  <SelectContent className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100">
                    <SelectItem value="all">
                      All Roles
                    </SelectItem>

                    <SelectItem value="Admin">
                      Admin
                    </SelectItem>

                    <SelectItem value="Donor">
                      Donor
                    </SelectItem>

                    <SelectItem value="Hospital">
                      Hospital
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* No Users */}
            {filteredUsers.length === 0 ? (
              <div className="rounded-xl border bg-white dark:bg-slate-900 dark:border-slate-800 p-8 text-center shadow-xs">
                <p className="text-slate-600 dark:text-slate-400">
                  No users found
                </p>
              </div>
            ) : (
              /* Users Table */
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                <div className="overflow-x-auto">
                  <Table className="min-w-[700px]">
                    <TableHeader>
                      <TableRow className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60">
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Name</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Email</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Role</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Details</TableHead>
                        <TableHead className="font-semibold text-slate-700 dark:text-slate-200">Joined</TableHead>
                        <TableHead className="text-right font-semibold text-slate-700 dark:text-slate-200">Action</TableHead>
                      </TableRow>
                    </TableHeader>

                    <TableBody>
                      {filteredUsers.map((u) => (
                        <TableRow key={u._id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                          {/* Name */}
                          <TableCell className="font-medium text-slate-900 dark:text-slate-100">
                            {u.name}
                          </TableCell>

                          {/* Email */}
                          <TableCell className="text-sm text-slate-700 dark:text-slate-200">
                            {u.email}
                          </TableCell>

                          {/* Role */}
                          <TableCell>
                            <Badge
                              className={getRoleBadgeColor(u.role)}
                            >
                              {u.role}
                            </Badge>
                          </TableCell>

                          {/* Details */}
                          <TableCell className="text-sm text-slate-600 dark:text-slate-300">
                            {u.role === 'Donor' && (
                              <>
                                Blood:{' '}
                                <span className="font-semibold text-red-600 dark:text-red-400">
                                  {u.bloodGroup || 'N/A'}
                                </span>
                              </>
                            )}

                            {u.role === 'Hospital' && (
                              <>
                                {u.hospitalName || 'N/A'}
                              </>
                            )}

                            {u.role === 'Admin' && 'Administrator'}
                          </TableCell>

                          {/* Joined Date */}
                          <TableCell className="text-sm text-slate-600 dark:text-slate-400">
                            {new Date(
                              u.createdAt
                            ).toLocaleDateString()}
                          </TableCell>

                          {/* Action */}
                          <TableCell className="text-right">
                            {u.role === 'Donor' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => router.push('/admin/donations')}
                                className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-900/60 dark:hover:bg-red-950/50 cursor-pointer"
                              >
                                Log Bleed
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
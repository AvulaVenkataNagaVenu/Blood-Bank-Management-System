'use client'

import * as React from 'react'
import { Moon, Sun, Monitor, Check } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  // const [mounted, setMounted] = React.useState(false)

  // // Prevent hydration mismatch between server and client theme
  // React.useEffect(() => {
  //   setMounted(true)
  // }, [])

  const mounted = React.useSyncExternalStore(
  () => () => {},
  () => true,
  () => false,
)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-9 w-9 rounded-lg border-border bg-background text-foreground hover:bg-accent hover:text-accent-foreground transition-colors cursor-pointer"
          aria-label="Select theme"
          title="Select theme (Light, Dark, System)"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0 text-amber-500" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100 text-sky-400" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-36 bg-popover border-border text-popover-foreground shadow-lg rounded-xl z-50 p-1"
      >
        <DropdownMenuItem
          onClick={() => setTheme('light')}
          className="flex items-center justify-between cursor-pointer text-xs font-medium py-2 px-2.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <span className="flex items-center gap-2">
            <Sun className="h-3.5 w-3.5 text-amber-500" />
            Light
          </span>
          {mounted && theme === 'light' && <Check className="h-3.5 w-3.5 text-primary font-bold" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('dark')}
          className="flex items-center justify-between cursor-pointer text-xs font-medium py-2 px-2.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <span className="flex items-center gap-2">
            <Moon className="h-3.5 w-3.5 text-sky-400" />
            Dark
          </span>
          {mounted && theme === 'dark' && <Check className="h-3.5 w-3.5 text-primary font-bold" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setTheme('system')}
          className="flex items-center justify-between cursor-pointer text-xs font-medium py-2 px-2.5 rounded-lg hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <span className="flex items-center gap-2">
            <Monitor className="h-3.5 w-3.5 text-slate-400" />
            System
          </span>
          {mounted && theme === 'system' && <Check className="h-3.5 w-3.5 text-primary font-bold" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

/** Theme choice (FR2). "system" follows prefers-color-scheme; the resolved value is written to <html data-theme>. */
export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

// Same storage key as cpaltracker-react's themeStore, so the choice carries over.
const STORAGE_KEY = 'cpaltracker:theme'

interface ThemeContextValue {
  theme: ThemeChoice
  resolved: ResolvedTheme
  setTheme: (theme: ThemeChoice) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function readStored(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    // storage unavailable: fall back to the default
  }
  return 'system' // D7: follow the OS by default; the toggle overrides and persists (2026-11-25)
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(readStored)
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme)
  const resolved = theme === 'system' ? system : theme

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)')
    const onChange = () => setSystem(query.matches ? 'light' : 'dark')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
  }, [resolved])

  const setTheme = useCallback((next: ThemeChoice) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // not persisted; the choice still applies for this session
    }
  }, [])

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}

/**
 * The resolved theme for components that may render outside the provider (kit components in isolation,
 * unit tests): the provider's value when there is one, else <html data-theme> as theme-init.js set it.
 */
export function useResolvedTheme(): ResolvedTheme {
  const context = useContext(ThemeContext)
  if (context) return context.resolved
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'
}

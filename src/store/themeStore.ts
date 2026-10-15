import { create } from 'zustand'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'cpaltracker:theme'

function readPersistedTheme(): Theme {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // storage unavailable (private mode, blocked, etc.) — fall through to default
  }
  return 'light'
}

function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // best-effort only; theme still applies for this session
  }
}

interface ThemeState {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: readPersistedTheme(),
  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === 'light' ? 'dark' : 'light'
      persistTheme(next)
      return { theme: next }
    }),
  setTheme: (theme) => {
    persistTheme(theme)
    set({ theme })
  },
}))

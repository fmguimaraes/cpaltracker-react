import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from '@/app/theme'
import { Button } from '@/ui/button'

/** Copy of the theme control; the app overrides it to keep the language of its pages. */
export interface ThemeToggleLabels {
  /** aria-label of the group. */
  group: string
  /** aria-label of the main button while the resolved theme is dark. */
  toLight: string
  /** aria-label of the main button while the resolved theme is light. */
  toDark: string
  /** aria-label of the "follow the system" button. */
  system: string
}

export const DEFAULT_THEME_LABELS: ThemeToggleLabels = {
  group: 'Thème',
  toLight: 'Passer au thème clair',
  toDark: 'Passer au thème sombre',
  system: 'Thème du système',
}

/**
 * Global theme control. The main button (data-testid="theme-toggle") flips the resolved theme
 * light <-> dark in a single click (and stores that explicit choice); the companion button
 * (data-testid="theme-system") returns to "follow the system" and shows it with aria-pressed.
 * `labels` overrides the aria-labels (partial).
 */
export function ThemeToggle({ labels }: { labels?: Partial<ThemeToggleLabels> }) {
  const { theme, resolved, setTheme } = useTheme()
  const l = { ...DEFAULT_THEME_LABELS, ...labels }
  const next = resolved === 'dark' ? 'light' : 'dark'
  return (
    <div className="flex items-center gap-1" role="group" aria-label={l.group}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={next === 'light' ? l.toLight : l.toDark}
        data-testid="theme-toggle"
        data-theme-choice={theme}
        onClick={() => setTheme(next)}
      >
        {resolved === 'dark' ? <Sun /> : <Moon />}
      </Button>
      <Button
        variant={theme === 'system' ? 'secondary' : 'ghost'}
        size="icon-sm"
        aria-label={l.system}
        aria-pressed={theme === 'system'}
        data-testid="theme-system"
        onClick={() => setTheme('system')}
      >
        <Monitor />
      </Button>
    </div>
  )
}

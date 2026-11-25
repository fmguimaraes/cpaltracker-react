import { Moon, Sun } from 'lucide-react'
import { useTheme, type ThemeChoice } from '@/app/theme'
import { Button } from '@/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'
import { SELECTED_TOGGLE } from '@/ui/patterns/period-control'
import { cn } from '@/lib/utils'

/** Copy of the theme control; the app overrides it to keep the language of its pages. */
export interface ThemeToggleLabels {
  /** aria-label of the group. */
  group: string
  /** aria-label of the main button while the resolved theme is dark. */
  toLight: string
  /** aria-label of the main button while the resolved theme is light. */
  toDark: string
}

export const DEFAULT_THEME_LABELS: ThemeToggleLabels = {
  group: 'Thème',
  toLight: 'Passer au thème clair',
  toDark: 'Passer au thème sombre',
}

/**
 * One-click theme flip (data-testid="theme-toggle"): flips the resolved theme light <-> dark and stores that
 * explicit choice. No longer in the app shell's top bar (Pulse layout v2: the theme lives in the user menu,
 * `ThemeChoiceControl`); kept for pages outside the shell.
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
    </div>
  )
}

/** Copy of the 3-way theme choice of the user menu. */
export interface ThemeChoiceLabels {
  group: string
  light: string
  dark: string
  system: string
}

export const DEFAULT_THEME_CHOICE_LABELS: ThemeChoiceLabels = {
  group: 'Thème',
  light: 'Clair',
  dark: 'Sombre',
  system: 'Système',
}

const THEME_CHOICES: ThemeChoice[] = ['light', 'dark', 'system']

/**
 * The user menu's theme control (Pulse layout v2 §3): a segmented Clair | Sombre | Système, the stored
 * choice selected (default Système, which follows the OS). Items: `theme-light`, `theme-dark`, `theme-system`.
 */
export function ThemeChoiceControl({ labels, className }: { labels?: Partial<ThemeChoiceLabels>; className?: string }) {
  const { theme, setTheme } = useTheme()
  const l = { ...DEFAULT_THEME_CHOICE_LABELS, ...labels }
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={theme}
      onValueChange={(next) => next && setTheme(next as ThemeChoice)}
      aria-label={l.group}
      data-testid="theme-choice"
      className={cn('w-full', className)}
    >
      {THEME_CHOICES.map((choice) => (
        <ToggleGroupItem key={choice} value={choice} className={cn('flex-1', SELECTED_TOGGLE)} data-testid={`theme-${choice}`}>
          {l[choice]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}

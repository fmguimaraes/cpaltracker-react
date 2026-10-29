import { Monitor, Smartphone } from 'lucide-react'
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'

export type ViewportMode = 'desktop' | 'mobile'

/** Width of the simulated mobile viewport (iframe), in px. */
export const MOBILE_FRAME_WIDTH = 390

/**
 * Viewport state lives in the URL: `?view=mobile` (parent shell shows the page in a 390 px iframe)
 * and `?frame=1` (inside that iframe: shell without toolbar).
 */
export function useViewport() {
  const [params, setParams] = useSearchParams()
  const mode: ViewportMode = params.get('view') === 'mobile' ? 'mobile' : 'desktop'
  const isFrame = params.get('frame') === '1'
  const setMode = useCallback(
    (next: ViewportMode) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev)
          if (next === 'mobile') out.set('view', 'mobile')
          else out.delete('view')
          return out
        },
        { replace: true },
      )
    },
    [setParams],
  )
  /** Keeps `view` / `frame` on internal links so the viewport survives navigation. */
  const withViewport = useCallback(
    (to: string) => {
      const keep = new URLSearchParams()
      if (params.get('view') === 'mobile' && !isFrame) keep.set('view', 'mobile')
      if (isFrame) keep.set('frame', '1')
      const qs = keep.toString()
      return qs ? `${to}${to.includes('?') ? '&' : '?'}${qs}` : to
    },
    [params, isFrame],
  )
  return { mode, setMode, isFrame, withViewport, params }
}

/** Desktop / mobile (390 px) viewport switch. */
export function ViewportToggle() {
  const { mode, setMode } = useViewport()
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={mode}
      onValueChange={(value) => value && setMode(value as ViewportMode)}
      aria-label="Affichage"
      data-testid="viewport-toggle"
      className="hidden md:flex"
    >
      <ToggleGroupItem value="desktop" aria-label="Affichage bureau" data-testid="viewport-desktop">
        <Monitor />
      </ToggleGroupItem>
      <ToggleGroupItem value="mobile" aria-label={`Affichage mobile ${MOBILE_FRAME_WIDTH} px`} data-testid="viewport-mobile">
        <Smartphone />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

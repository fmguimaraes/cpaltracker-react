import { useCallback, type KeyboardEvent } from 'react'
import { Pause, Play, RotateCw, X } from 'lucide-react'
import { Button } from '@/ui/button'
import { Slider } from '@/ui/slider'
import { Spinner } from '@/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'
import { PeriodControl, SELECTED_TOGGLE } from '@/ui/patterns/period-control'
import { formatUpdateTime } from '@/ui/patterns/shell-refresh'
import { cn } from '@/lib/utils'
import { formatAbsolute } from '../anomalies/anomalyCard'
import { choiceOfPreset, customChoice, formatInstant, presetOfChoice } from './timelinePositions'
import { SPEEDS, type PulseTimeline, type Speed } from './usePulseTimeline'

/** One anomaly on the timeline track: a small mark in the anomaly colour at its time. */
export interface AnomalyTick {
  anomalyKey: string
  chipId: string
  at: number
  /** Tooltip: "Température 31 °C · CHIP-A · 15 nov. 11:00". */
  label: string
}

/** Where a tick sits on the track, in % of the period (clamped). */
export function tickPercent(at: number, fromMs: number, toMs: number): number {
  if (toMs <= fromMs) return 0
  return Math.min(100, Math.max(0, ((at - fromMs) / (toMs - fromMs)) * 100))
}

/** ←/→ move the replay instant by this share of the period. */
export const KEY_STEP_SHARE = 0.01

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** A control that Space already activates (buttons, segments): left to the browser. */
function activatesOnSpace(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.tagName === 'BUTTON' || ['button', 'radio', 'checkbox', 'menuitem'].includes(target.getAttribute('role') ?? '')
}

/**
 * The timeline's keyboard (Pulse layout v2 §2): Space = play/pause, ←/→ = step, End = back to live. Bound in
 * the capture phase on the timeline bar (`scope: 'bar'`) and on the map column (`scope: 'map'`, the Leaflet
 * container itself only, so markers and map controls keep their own keys). Never in a text field, and never
 * for keys typed in a portalled popover (React bubbles portal events through its tree: checked against the DOM).
 */
export function useTimelineKeys(timeline: PulseTimeline, scope: 'bar' | 'map') {
  const { instant, range, togglePlay, scrub, goLive } = timeline
  const fromMs = range.from.getTime()
  const toMs = range.to.getTime()
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      const target = event.target as Node
      if (!event.currentTarget.contains(target) || isEditable(event.target)) return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (scope === 'map' && !(event.target instanceof HTMLElement && event.target.classList.contains('leaflet-container'))) return
      const step = Math.max(60_000, (toMs - fromMs) * KEY_STEP_SHARE)
      const at = instant ?? toMs
      let handled = true
      if (event.key === ' ') {
        if (activatesOnSpace(event.target)) return
        togglePlay()
      } else if (event.key === 'ArrowLeft') scrub(Math.max(fromMs, at - step))
      else if (event.key === 'ArrowRight') {
        if (instant === null) return
        scrub(Math.min(toMs, at + step))
      } else if (event.key === 'End') goLive()
      else handled = false
      if (handled) {
        event.preventDefault()
        event.stopPropagation()
      }
    },
    [scope, instant, fromMs, toMs, togglePlay, scrub, goLive],
  )
}

/**
 * The Pulse timeline bar, docked under the map (map column only), always visible (Pulse layout v2 §2):
 * [▶/⏸] [1 j | 7 j | 15 j | 1 mois | 📅] [track over the period, anomaly ticks] [position] [×1 | ×4 | ×12].
 * Live: the handle is pinned at the end, the position reads "En direct", the speeds are disabled. ▶ (from
 * the period start, or from the handle once moved) or a drag enters replay: the position shows the local
 * instant, followed by "Revenir au direct". Live and replay share one layout (nothing appears or moves but
 * that text button, at the end of the flexible track).
 */
export function PulseTimelineBar({
  timeline,
  ticks = [],
  onTick,
}: {
  timeline: PulseTimeline
  ticks?: AnomalyTick[]
  /** A tick click: jump there and open that anomaly. */
  onTick?: (tick: AnomalyTick) => void
}) {
  const { range, instant, playing, speed, historyStatus, choice } = timeline
  const live = instant === null
  const fromMs = range.from.getTime()
  const toMs = range.to.getTime()
  const step = Math.max(60_000, Math.floor((toMs - fromMs) / 2000))
  const onKeyDownCapture = useTimelineKeys(timeline, 'bar')

  return (
    <div
      role="group"
      aria-label="Chronologie"
      data-testid="pulse-timeline"
      data-mode={live ? 'live' : 'replay'}
      onKeyDownCapture={onKeyDownCapture}
      className="flex h-12 shrink-0 items-center gap-2 border-t border-border bg-background px-3"
    >
      <Button
        size="icon-sm"
        variant={live ? 'outline' : 'default'}
        aria-label={playing ? 'Pause' : 'Lecture'}
        title={playing ? 'Pause (Espace)' : 'Lecture (Espace)'}
        data-testid="pulse-play"
        onClick={timeline.togglePlay}
        className="shrink-0"
      >
        {playing ? <Pause /> : <Play />}
      </Button>
      <PeriodControl
        preset={presetOfChoice(choice)}
        range={range}
        onPreset={(preset) => timeline.setChoice(choiceOfPreset(preset))}
        onCustom={(from, to) => timeline.setChoice(customChoice(from, to))}
        testId="pulse-period"
        customButton="icon"
        className="max-md:hidden"
      />
      <div className="relative flex min-w-24 flex-1 items-center self-stretch">
        <Slider
          aria-label="Instant de lecture"
          aria-valuetext={live ? 'En direct' : formatInstant(instant ?? toMs)}
          data-testid="pulse-slider"
          min={fromMs}
          max={toMs}
          step={step}
          value={[instant ?? toMs]}
          onValueChange={([value]) => timeline.scrub(value)}
        />
        {ticks.length > 0 && (
          <ul aria-label="Anomalies sur la période" className="pointer-events-none absolute inset-x-0 top-1 h-2.5" data-testid="pulse-ticks">
            {ticks.map((tick) => (
              <li
                key={tick.anomalyKey}
                className="absolute top-0 -translate-x-1/2"
                // Dynamic geometry (a % of the period): set imperatively, there is no token for it.
                ref={(el) => {
                  if (el) el.style.left = `${tickPercent(tick.at, fromMs, toMs)}%`
                }}
              >
                <Button
                  variant="ghost"
                  className="pointer-events-auto block h-2.5 w-1 min-w-0 rounded-xs bg-danger p-0 hover:bg-danger/80"
                  aria-label={`Anomalie : ${tick.label}`}
                  title={tick.label}
                  onClick={() => onTick?.(tick)}
                  data-testid={`pulse-tick-${tick.anomalyKey}`}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
      <span
        data-testid="pulse-instant"
        aria-live="polite"
        className="flex shrink-0 items-center gap-1.5 text-sm font-semibold whitespace-nowrap tabular-nums"
      >
        {historyStatus === 'loading' && (
          <>
            <Spinner className="size-3.5" aria-hidden />
            <span className="sr-only">Chargement de l’historique…</span>
          </>
        )}
        {live ? 'En direct' : formatInstant(instant ?? toMs)}
      </span>
      {!live && (
        <Button variant="link" size="sm" className="h-auto shrink-0 px-0" onClick={timeline.goLive} data-testid="pulse-go-live">
          Revenir au direct
        </Button>
      )}
      {historyStatus === 'error' && (
        <span
          role="status"
          data-testid="pulse-history-error"
          className="shrink-0 text-xs text-danger"
          title="Impossible de charger l’historique : la carte reste sur les dernières positions connues."
        >
          Historique indisponible
        </span>
      )}
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        spacing={0}
        value={String(speed)}
        onValueChange={(next) => next && timeline.setSpeed(Number(next) as Speed)}
        aria-label="Vitesse de lecture"
        data-testid="pulse-speed"
        disabled={live}
        className="shrink-0 bg-muted max-sm:hidden"
      >
        {SPEEDS.map((s) => (
          <ToggleGroupItem key={s} value={String(s)} className={SELECTED_TOGGLE} data-testid={`pulse-speed-${s}`}>
            ×{s}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/** Tooltip of the live freshness chip. */
export function freshnessTooltip(lastUpdated: Date | null, failed: boolean, now: Date = new Date()): string {
  if (failed) return 'Échec de la mise à jour · réessayer'
  return lastUpdated ? `Dernière mise à jour ${formatAbsolute(lastUpdated, now)}` : 'Dernière mise à jour inconnue'
}

/**
 * The top bar's freshness chip (Pulse layout v2 §1b), replacing "En direct", "Mis à jour à …" and ↻.
 * Live: "● En direct · 11:02" with the refresh icon inside (spins while refreshing; after a failed refresh
 * the dot turns to the warning colour). Replay: "Rejeu · 15 nov. 11:00" with ✕ (back to live), no dot.
 */
export function PulseFreshnessChip({
  timeline,
  lastUpdated,
  refreshing,
  failed,
  onRefresh,
}: {
  timeline: PulseTimeline
  lastUpdated: Date | null
  refreshing: boolean
  failed: boolean
  onRefresh: () => void
}) {
  const live = timeline.instant === null
  const state = refreshing ? 'refreshing' : failed ? 'error' : 'ok'
  return (
    <div
      data-testid="pulse-freshness"
      data-mode={live ? 'live' : 'replay'}
      data-state={state}
      title={live ? freshnessTooltip(lastUpdated, failed) : undefined}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-full border bg-background pr-1 pl-3 text-sm whitespace-nowrap tabular-nums',
        live ? 'border-border' : 'border-primary text-primary-text',
      )}
    >
      {live ? (
        <>
          <span
            aria-hidden
            data-testid="pulse-freshness-dot"
            className={cn('size-2 shrink-0 rounded-full', failed ? 'bg-warning' : 'bg-success')}
          />
          <span>
            En direct{lastUpdated && <> · {formatUpdateTime(lastUpdated)}</>}
          </span>
          {failed && <span className="sr-only">, échec de la mise à jour</span>}
          <Button
            variant="ghost"
            size="icon-xs"
            className="rounded-full"
            aria-label="Rafraîchir"
            title={freshnessTooltip(lastUpdated, failed)}
            disabled={refreshing}
            onClick={onRefresh}
            data-testid="pulse-refresh"
          >
            <RotateCw aria-hidden className={cn(refreshing && 'animate-spin')} />
          </Button>
        </>
      ) : (
        <>
          <span>Rejeu · {formatInstant(timeline.instant ?? 0)}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            className="rounded-full"
            aria-label="Revenir au direct"
            title="Revenir au direct"
            onClick={timeline.goLive}
            data-testid="pulse-freshness-live"
          >
            <X aria-hidden />
          </Button>
        </>
      )}
    </div>
  )
}

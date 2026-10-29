import { useCallback, useEffect, useState } from 'react'
import { Maximize2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { Button } from '@/ui/button'
import { ButtonGroup } from '@/ui/button-group'
import { Label } from '@/ui/label'
import { Slider } from '@/ui/slider'
import { Switch } from '@/ui/switch'
import { cn } from '@/lib/utils'
import type { FleetMapTrack } from './FleetMap'
import type { TrackPoint } from './types'

export interface TrackPlaybackState {
  index: number
  setIndex: (i: number) => void
  playing: boolean
  toggle: () => void
  step: (delta: number) => void
  showTrail: boolean
  setShowTrail: (v: boolean) => void
  fit: () => void
  /** Pass to `<FleetMap track={...} />`. */
  track: FleetMapTrack
}

/** Playback state for a track: index, play/pause timer (stops at the end), trail switch, fit tick. */
export function useTrackPlayback(points: TrackPoint[], intervalMs = 400): TrackPlaybackState {
  const last = Math.max(points.length - 1, 0)
  const [index, setIndexRaw] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [showTrail, setShowTrail] = useState(true)
  const [fitTick, setFitTick] = useState(0)

  const setIndex = useCallback((i: number) => setIndexRaw(Math.min(Math.max(i, 0), last)), [last])

  useEffect(() => {
    if (!playing) return
    const timer = setInterval(() => {
      setIndexRaw((i) => {
        if (i >= last) {
          setPlaying(false)
          return i
        }
        return i + 1
      })
    }, intervalMs)
    return () => clearInterval(timer)
  }, [playing, last, intervalMs])

  const toggle = () => {
    if (!playing && index >= last) setIndexRaw(0)
    setPlaying((p) => !p)
  }
  const step = (delta: number) => {
    setPlaying(false)
    setIndex(index + delta)
  }
  return {
    index: Math.min(index, last),
    setIndex: (i) => {
      setPlaying(false)
      setIndex(i)
    },
    playing,
    toggle,
    step,
    showTrail,
    setShowTrail,
    fit: () => setFitTick((t) => t + 1),
    track: { points, index: Math.min(index, last), showTrail, fitTick },
  }
}

function clock(t: string) {
  return `${new Date(t).toISOString().slice(11, 16)} UTC`
}

/**
 * Timeline playback companion for FleetMap: instant slider, step/play/pause,
 * trail switch and fit-to-track. Controlled by `useTrackPlayback`.
 */
export function TrackPlayback({
  points,
  playback,
  className,
}: {
  points: TrackPoint[]
  playback: TrackPlaybackState
  className?: string
}) {
  const { index, setIndex, playing, toggle, step, showTrail, setShowTrail, fit } = playback
  const last = Math.max(points.length - 1, 0)
  const current = points[index]
  return (
    <div
      role="group"
      aria-label="Track playback"
      data-testid="track-playback"
      className={cn('flex flex-col gap-3 rounded-lg bg-card p-3 shadow-media sm:flex-row sm:items-center', className)}
    >
      <ButtonGroup>
        <Button variant="outline" size="icon" aria-label="Previous position" disabled={index <= 0} onClick={() => step(-1)}>
          <SkipBack />
        </Button>
        <Button variant="default" size="icon" aria-label={playing ? 'Pause playback' : 'Play track'} onClick={toggle}>
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button variant="outline" size="icon" aria-label="Next position" disabled={index >= last} onClick={() => step(1)}>
          <SkipForward />
        </Button>
      </ButtonGroup>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Slider
          aria-label="Track position"
          min={0}
          max={last}
          step={1}
          value={[index]}
          onValueChange={([v]) => setIndex(v)}
        />
        <span className="w-24 shrink-0 text-sm tabular-nums text-body" aria-live="off">
          {current ? clock(current.t) : '–'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Switch id="track-trail" checked={showTrail} onCheckedChange={setShowTrail} />
          <Label htmlFor="track-trail">Trail</Label>
        </div>
        <Button variant="outline" size="sm" onClick={fit}>
          <Maximize2 /> Fit to track
        </Button>
      </div>
    </div>
  )
}

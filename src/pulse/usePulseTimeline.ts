import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchContractHistory, type HistoryResponse } from '../api/history'
import type { Position } from '../api/positions'
import { useLoad } from '../anomalies/useLoad'
import { formatIsoDate } from '../history/dateRange'
import { buildDeviceSeries, REPLAY_TICK_MS, replayStepMs } from '../history/timelineData'
import { filterByLastReport } from '../live-tracking/lastReportFilter'
import type { MapTrail, MapViewport } from '@/ui/map'
import {
  DEFAULT_PERIOD,
  editRange,
  inViewport,
  positionsAt,
  reportWindow,
  resolveRangeChoice,
  trailsAt,
  type RangeChoice,
  type TimeSpan,
} from './timelinePositions'

const NO_TRAILS: MapTrail[] = []

export const SPEEDS = [1, 4, 12] as const
export type Speed = (typeof SPEEDS)[number]

/** Where a chip's pallet is: on the map and in view, on the map but panned/zoomed out of view, or with no position to show (period/instant). */
export type ChipState = 'in-view' | 'out-of-view' | 'unavailable'

export interface PalletChip {
  position: Position
  state: ChipState
}

export interface PulseTimeline {
  choice: RangeChoice
  /** The page's one period: pallet panel range and playback span (the map's last-report filter is `reportRange`). */
  range: TimeSpan
  /** The map's last-report filter window: `range`, but a preset has no upper bound (future-dated reports stay). */
  reportRange: TimeSpan
  setPreset: (days: string) => void
  setDate: (field: 'start' | 'end', value: string) => void
  /** Any period choice (the shared control's preset or calendar range, the URL). */
  setChoice: (choice: RangeChoice) => void
  /** `null` = live (the snapshot as loaded); otherwise the playback instant (epoch ms). */
  instant: number | null
  playing: boolean
  speed: Speed
  setSpeed: (speed: Speed) => void
  togglePlay: () => void
  rewind: () => void
  scrub: (instant: number) => void
  goLive: () => void
  /** From live: replay the period from its start (playing). */
  startReplay: () => void
  /** Playback history: still loading, or failed. */
  historyStatus: 'idle' | 'loading' | 'error' | 'ready'
  /** Exactly what the map draws (lot filter, then the period in live or the instant in playback). */
  displayed: Position[]
  /** Playback only: each displayed pallet's path from the start of the period up to the instant (none live). */
  trails: MapTrail[]
  /** The displayed pallets that have a position, i.e. on the map wherever the view is. */
  mapChipIds: ReadonlySet<string>
  /** The displayed pallets inside the map's current viewport. */
  visibleChipIds: ReadonlySet<string>
  /** Every pallet on the map is inside the viewport (nothing for "Vue d'ensemble" to bring back). */
  allInView: boolean
  chips: PalletChip[]
  setViewport: (viewport: MapViewport) => void
}

/**
 * Pulse timeline state: the period (preset or du/au dates), playback over it (History API rows, fetched on
 * the first play/scrub/rewind only) and the map viewport. `positions` is the snapshot already narrowed by
 * the lot filter; `now` is the snapshot's load time.
 */
export function usePulseTimeline({
  contractId,
  positions,
  now,
  initialChoice = DEFAULT_PERIOD,
  initialInstant = null,
}: {
  contractId: number | null
  positions: Position[]
  now: Date
  /** Deep link: the period to open on (read once). */
  initialChoice?: RangeChoice
  /** Deep link: open paused in replay at this instant (read once; `null` = live). */
  initialInstant?: number | null
}): PulseTimeline {
  const [choice, setChoice] = useState<RangeChoice>(initialChoice)
  const [instant, setInstant] = useState<number | null>(initialInstant)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>(1)
  const [historyWanted, setHistoryWanted] = useState(initialInstant !== null)
  const [viewport, setViewportState] = useState<MapViewport | null>(null)

  // A contract switch starts over: live, no history. The first contract resolved (null → id) is not a
  // switch, so a deep-linked replay instant survives the contracts' loading.
  const [forContract, setForContract] = useState(contractId)
  if (forContract !== contractId) {
    setForContract(contractId)
    if (forContract !== null) {
      setInstant(null)
      setPlaying(false)
      setHistoryWanted(false)
    }
  }

  const range = useMemo(() => resolveRangeChoice(choice, now), [choice, now])
  const fromMs = range.from.getTime()
  const toMs = range.to.getTime()
  // A refresh moves a preset's end forward: keep the instant inside the period.
  const current = instant === null ? null : Math.min(Math.max(instant, fromMs), toMs)

  // The API is day-granular: keyed on the days, so a refresh within the same day does not re-fetch.
  const startDay = formatIsoDate(range.from)
  const endDay = formatIsoDate(range.to)
  const load = useCallback(
    (): Promise<HistoryResponse | null> =>
      historyWanted && contractId !== null
        ? fetchContractHistory(contractId, { start: new Date(`${startDay}T00:00:00Z`), end: new Date(`${endDay}T00:00:00Z`) })
        : Promise.resolve(null),
    [historyWanted, contractId, startDay, endDay],
  )
  const { state: history } = useLoad(load, undefined, String(contractId))
  const rows = history.status === 'ready' ? history.value?.rows ?? null : null
  const byDevice = useMemo(() => (rows ? buildDeviceSeries(rows) : null), [rows])
  let historyStatus: PulseTimeline['historyStatus'] = 'idle'
  if (historyWanted) historyStatus = history.status === 'ready' ? (rows ? 'ready' : 'loading') : history.status

  useEffect(() => {
    if (!playing) return
    const step = replayStepMs(fromMs, toMs) * speed
    const timer = setInterval(() => {
      setInstant((previous) => {
        const next = Math.min(toMs, (previous ?? fromMs) + step)
        if (next >= toMs) setPlaying(false)
        return next
      })
    }, REPLAY_TICK_MS)
    return () => clearInterval(timer)
  }, [playing, speed, fromMs, toMs])

  const togglePlay = useCallback(() => {
    if (playing) {
      setPlaying(false)
      return
    }
    setHistoryWanted(true)
    setInstant((previous) => (previous === null || previous >= toMs ? fromMs : previous))
    setPlaying(true)
  }, [playing, fromMs, toMs])
  const rewind = useCallback(() => {
    setHistoryWanted(true)
    setPlaying(false)
    setInstant(fromMs)
  }, [fromMs])
  const scrub = useCallback((value: number) => {
    setHistoryWanted(true)
    setPlaying(false)
    setInstant(value)
  }, [])
  const goLive = useCallback(() => {
    setPlaying(false)
    setInstant(null)
  }, [])
  const startReplay = useCallback(() => {
    setHistoryWanted(true)
    setInstant(fromMs)
    setPlaying(true)
  }, [fromMs])
  const setPreset = useCallback((days: string) => setChoice({ kind: 'preset', days }), [])
  const setDate = useCallback(
    (field: 'start' | 'end', value: string) => {
      const next = editRange(range, field, value)
      if (next) setChoice(next)
    },
    [range],
  )

  const reportRange = useMemo(() => reportWindow(choice, range), [choice, range])
  const period = useMemo(() => ({ preset: 'custom' as const, from: reportRange.from, to: reportRange.to }), [reportRange])
  // Playback falls back to the live snapshot until the history has arrived.
  const displayed = useMemo(
    () => (current !== null && byDevice ? positionsAt(positions, byDevice, current) : filterByLastReport(positions, period)),
    [current, byDevice, positions, period],
  )
  // Same condition as `displayed`'s playback branch: no trail live, nor while the history is still loading.
  const trails = useMemo(
    () => (current !== null && byDevice ? trailsAt(displayed, byDevice, fromMs, current) : NO_TRAILS),
    [current, byDevice, displayed, fromMs],
  )
  const mapChipIds = useMemo(
    () => new Set(displayed.filter((p) => p.latitude !== null && p.longitude !== null).map((p) => p.chipId)),
    [displayed],
  )
  const visibleChipIds = useMemo(
    () => new Set(displayed.filter((p) => inViewport(p, viewport)).map((p) => p.chipId)),
    [displayed, viewport],
  )
  const allInView = visibleChipIds.size === mapChipIds.size

  const chips = useMemo<PalletChip[]>(() => {
    const byChip = new Map(displayed.map((p) => [p.chipId, p]))
    return positions.map((position) => {
      const onMap = byChip.get(position.chipId)
      let state: ChipState = 'unavailable'
      if (visibleChipIds.has(position.chipId)) state = 'in-view'
      else if (mapChipIds.has(position.chipId)) state = 'out-of-view'
      return { position: onMap ?? position, state }
    })
  }, [positions, displayed, visibleChipIds, mapChipIds])

  return {
    choice,
    range,
    reportRange,
    setPreset,
    setDate,
    setChoice,
    instant: current,
    playing,
    speed,
    setSpeed,
    togglePlay,
    rewind,
    scrub,
    goLive,
    startReplay,
    historyStatus,
    displayed,
    trails,
    mapChipIds,
    visibleChipIds,
    allInView,
    chips,
    setViewport: setViewportState,
  }
}

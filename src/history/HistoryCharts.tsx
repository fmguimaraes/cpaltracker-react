import { useState } from 'react'
import type { HistoryRow, MeasureKey, MeasureSummary } from '../api/history'
import { MeasureChartModal } from './MeasureChartModal'
import { MeasureTile } from './MeasureTile'

/**
 * KAN-252 (FR10-FR16, NFR5, NFR6) — replaces the three full-size Plotly
 * charts (KAN-175/KAN-223/KAN-176) with one compact `MeasureTile` per
 * measure, each opening the full chart in a `MeasureChartModal` on demand.
 * The full chart itself is unchanged: it moved into the modal verbatim
 * (`chartData.ts`'s `buildChartTraces`, `timelineData.ts`'s `formatUtc`,
 * the same 2-8 °C threshold band) — see `MeasureChartModal.tsx`'s own
 * doc-comment for what did and didn't change there.
 *
 * Owns two pieces of state, deliberately kept separate: `modalOpen`
 * (whether the modal is visible) and `selectedMeasure` (which measure it
 * shows), rather than a single `openMeasure: MeasureKey | null`. See the
 * comment on `modalOpen` below for why — collapsing them back into one
 * state is what caused the KAN-252 code-review animation bug.
 */
export interface HistoryChartsProps {
  rows: HistoryRow[]
  visibleDeviceIds?: string[] | null
  summaries: Record<MeasureKey, MeasureSummary | null>
  /**
   * KAN-252 — `TimelineMap`'s playback/scrub instant (epoch ms), lifted up
   * by `HistoryReadyPanel`; `null` while idle. Only forwarded to the modal
   * while it's actually open (below) — the modal stays mounted throughout a
   * replay, so this avoids feeding it a new cursor on every 80ms replay
   * tick while nobody is looking at it.
   */
  cursorInstant?: number | null
}

const MEASURES: MeasureKey[] = ['ta', 'hr', 'm']

export function HistoryCharts({ rows, visibleDeviceIds = null, summaries, cursorInstant = null }: HistoryChartsProps) {
  // KAN-252 code review — `MeasureChartModal` is always mounted; only its `open` prop toggles.
  // Gating the mount itself (`{modalOpen && <MeasureChartModal .../>}`) unmounts the whole
  // subtree the instant `setModalOpen(false)` commits, which cuts off Radix's close animation
  // (`data-closed:animate-out` in `@/ui/dialog.tsx`) before it ever plays. `selectedMeasure`
  // tracks which measure the modal shows independently of whether it's open, so there's no need
  // for a throwaway fallback measure while closed.
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedMeasure, setSelectedMeasure] = useState<MeasureKey>(MEASURES[0])
  const hasRows = rows.length > 0

  if (!hasRows) {
    return (
      <p data-testid="history-charts-empty" className="text-sm text-muted-foreground">
        Aucune mesure à représenter.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-12" data-testid="history-charts">
      {MEASURES.map((measure) => (
        <div key={measure} data-testid={`history-chart-${measure}`} className="sm:col-span-4">
          <MeasureTile
            measure={measure}
            // KAN-252 code review: `summaries` may come from an older/incomplete fixture (e.g. a
            // response predating KAN-231) even though `fetchContractHistory` now defaults it —
            // guard here too rather than assume every caller went through that one function.
            summary={summaries?.[measure] ?? null}
            onExpand={() => {
              setSelectedMeasure(measure)
              setModalOpen(true)
            }}
          />
        </div>
      ))}

      <MeasureChartModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        measure={selectedMeasure}
        onMeasureChange={setSelectedMeasure}
        rows={rows}
        visibleDeviceIds={visibleDeviceIds}
        summaries={summaries}
        cursorInstant={modalOpen ? cursorInstant : null}
      />
    </div>
  )
}

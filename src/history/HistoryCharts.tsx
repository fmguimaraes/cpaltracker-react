import { useState } from 'react'
import type { HistoryRow, MeasureKey, MeasureSummary } from '../api/history'
import { MeasureChartModal } from './MeasureChartModal'
import { MeasureTile } from './MeasureTile'

/**
 * KAN-232 (FR10-FR16, NFR5, NFR6) — replaces the three full-size Plotly
 * charts (KAN-175/KAN-223/KAN-176) with one compact `MeasureTile` per
 * measure, each opening the full chart in a `MeasureChartModal` on demand.
 * The full chart itself is unchanged: it moved into the modal verbatim
 * (`chartData.ts`'s `buildChartTraces`, `timelineData.ts`'s `formatUtc`,
 * the same 2-8 °C threshold band) — see `MeasureChartModal.tsx`'s own
 * doc-comment for what did and didn't change there.
 *
 * Owns exactly one piece of state: which measure's modal is open
 * (`null` = closed). The modal's own tabs call `setOpenMeasure` to switch
 * measures without closing/reopening the dialog.
 */
export interface HistoryChartsProps {
  rows: HistoryRow[]
  visibleDeviceIds?: string[] | null
  summaries: Record<MeasureKey, MeasureSummary | null>
}

const MEASURES: MeasureKey[] = ['ta', 'hr', 'm']

export function HistoryCharts({ rows, visibleDeviceIds = null, summaries }: HistoryChartsProps) {
  const [openMeasure, setOpenMeasure] = useState<MeasureKey | null>(null)
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
            summary={summaries[measure]}
            onExpand={() => setOpenMeasure(measure)}
          />
        </div>
      ))}

      {openMeasure && (
        <MeasureChartModal
          open={openMeasure !== null}
          onOpenChange={(open) => setOpenMeasure(open ? openMeasure : null)}
          measure={openMeasure}
          onMeasureChange={setOpenMeasure}
          rows={rows}
          visibleDeviceIds={visibleDeviceIds}
          summaries={summaries}
        />
      )}
    </div>
  )
}

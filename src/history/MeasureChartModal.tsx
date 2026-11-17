import type { HistoryRow } from '../api/history'
import type { MeasureKey, MeasureSummary } from '../api/history'
import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/dialog'
import { TimeSeriesChart, type Series } from '@/ui/charts/time-series-chart'
import { buildChartTraces, CHART_FIELD_LABELS } from './chartData'
import { formatUtc } from './timelineData'
import {
  MEASURE_LABELS,
  MEASURE_UNITS,
  TEMPERATURE_THRESHOLD,
  formatMeasureCount,
  formatMeasureValue,
  formatSignedMeasureValue,
} from './measureFormatting'

const MEASURES: MeasureKey[] = ['ta', 'hr', 'm']

/**
 * KAN-232 (FR12-FR15) — the full chart, relocated here from `HistoryCharts.tsx`
 * verbatim (same `buildChartTraces`/`TimeSeriesChart`/`formatUtc`, same
 * threshold band): this story moves it into a modal, it does not change it.
 *
 * FR17 is deliberately NOT implemented: the feature spec describes a
 * separate per-measure series endpoint with its own loading/error/retry
 * state, but this codebase's `fetchContractHistory` already returns
 * `rows`+`summaries` for every measure in one call (KAN-231), so the chart
 * data is synchronously in hand the moment this modal opens — there is
 * nothing to be "in flight". Noted as a documented adaptation, not an
 * oversight.
 *
 * FR14's resize: `TimeSeriesChart` (`@/ui/charts/plot.tsx`'s `Plot`) passes
 * `useResizeHandler` to Plotly, which re-measures on its container's
 * resize via Plotly's own `ResizeObserver`-backed handler — no explicit
 * `chart.resize()` call is needed once the dialog's content element has
 * its final size, which it does as soon as it mounts (Radix `DialogContent`
 * is sized by CSS, not by an animation that changes layout dimensions).
 */
export interface MeasureChartModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  measure: MeasureKey
  onMeasureChange: (measure: MeasureKey) => void
  rows: HistoryRow[]
  visibleDeviceIds?: string[] | null
  summaries: Record<MeasureKey, MeasureSummary | null>
}

export function MeasureChartModal({
  open,
  onOpenChange,
  measure,
  onMeasureChange,
  rows,
  visibleDeviceIds = null,
  summaries,
}: MeasureChartModalProps) {
  const summary = summaries?.[measure] ?? null
  const label = summary?.label ?? MEASURE_LABELS[measure]
  const unit = summary?.unit ?? MEASURE_UNITS[measure]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl" data-testid="measure-chart-modal">
        <DialogHeader>
          <DialogTitle>
            {label} ({unit})
          </DialogTitle>
        </DialogHeader>

        <MeasureTabs active={measure} onSelect={onMeasureChange} />
        <StatsRow summary={summary} unit={unit} />
        <ModalChart measure={measure} rows={rows} visibleDeviceIds={visibleDeviceIds} unit={unit} />
      </DialogContent>
    </Dialog>
  )
}

function MeasureTabs({ active, onSelect }: { active: MeasureKey; onSelect: (measure: MeasureKey) => void }) {
  return (
    <div role="group" aria-label="Choisir une mesure" className="flex gap-1.5">
      {MEASURES.map((measure) => (
        <Button
          key={measure}
          type="button"
          variant={measure === active ? 'secondary' : 'outline'}
          size="sm"
          data-testid={`measure-tab-${measure}`}
          aria-pressed={measure === active}
          onClick={() => onSelect(measure)}
          className="min-w-11"
        >
          {MEASURE_LABELS[measure]}
        </Button>
      ))}
    </div>
  )
}

function StatsRow({ summary, unit }: { summary: MeasureSummary | null; unit: string }) {
  const decimals = summary?.decimals ?? 1
  const stats: Array<[string, string]> = [
    ['Dernière', formatStatValue(summary?.last ?? null, decimals, unit)],
    ['Min', formatStatValue(summary?.min ?? null, decimals, unit)],
    ['Max', formatStatValue(summary?.max ?? null, decimals, unit)],
    ['Moyenne', formatStatValue(summary?.mean ?? null, decimals, unit)],
    ['Δ période', formatSignedStatValue(summary?.periodChange ?? null, decimals, unit)],
    ['Δ 24 h', formatSignedStatValue(summary?.change24h ?? null, decimals, unit)],
    ['Mesures', summary ? formatMeasureCount(summary.count) : '—'],
  ]

  return (
    <dl data-testid="measure-stats-row" className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
      {stats.map(([term, value]) => (
        <div key={term} className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{term}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function formatStatValue(value: number | null, decimals: number, unit: string): string {
  if (value === null) return '—'
  return `${formatMeasureValue(value, decimals)} ${unit}`
}

function formatSignedStatValue(value: number | null, decimals: number, unit: string): string {
  if (value === null) return '—'
  return `${formatSignedMeasureValue(value, decimals)} ${unit}`
}

function ModalChart({
  measure,
  rows,
  visibleDeviceIds,
  unit,
}: {
  measure: MeasureKey
  rows: HistoryRow[]
  visibleDeviceIds: string[] | null
  unit: string
}) {
  const traces = buildChartTraces(rows, visibleDeviceIds, measure)
  const series: Series[] = traces.map((trace) => ({
    name: trace.chipId,
    x: trace.x.map(formatUtc),
    y: trace.y,
  }))
  return (
    <div data-testid="measure-chart-modal-plot">
      <TimeSeriesChart
        className="h-80 w-full"
        series={series}
        unit={unit}
        threshold={measure === 'ta' ? TEMPERATURE_THRESHOLD : undefined}
        label={CHART_FIELD_LABELS[measure]}
      />
    </div>
  )
}

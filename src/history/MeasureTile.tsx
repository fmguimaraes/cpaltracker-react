import { ArrowDownIcon, ArrowUpIcon, ExpandIcon, MinusIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import type { MeasureKey, MeasureSummary } from '../api/history'
import {
  MEASURE_LABELS,
  MEASURE_UNITS,
  buildSparklinePaths,
  formatChange24hLabel,
  formatExcursionsBadge,
  formatMeasureValue,
  formatMinMaxFooter,
  trendDirection,
} from './measureFormatting'

const SPARKLINE_WIDTH = 120
const SPARKLINE_HEIGHT = 32

const TREND_ICONS = { up: ArrowUpIcon, down: ArrowDownIcon, flat: MinusIcon }

/**
 * KAN-252 (FR10, FR11, FR16, NFR5, NFR6) — one compact tile per measure,
 * replacing the full-size chart that used to sit here. All the numbers come
 * straight off `summary` (backend-computed, KAN-231) — this component only
 * lays them out; every format/derivation lives in `measureFormatting.ts`.
 *
 * NFR5: the sparkline is a minimal inline SVG, not the kit's Plotly-backed
 * `Sparkline` (`@/ui/charts/sparkline`) — that component instantiates a
 * full Plotly chart per tile, which is both heavier than three tiles need
 * at once and harder to guarantee axis/gridline/tooltip-free than a plain
 * `<path>`. Documented deviation: no new charting dependency is pulled in,
 * per the brief.
 */
export interface MeasureTileProps {
  measure: MeasureKey
  summary: MeasureSummary | null
  onExpand: () => void
}

export function MeasureTile({ measure, summary, onExpand }: MeasureTileProps) {
  const label = summary?.label ?? MEASURE_LABELS[measure]
  const unit = summary?.unit ?? MEASURE_UNITS[measure]
  const hasData = summary !== null && summary.count > 0

  return (
    <div
      data-testid={`measure-tile-${measure}`}
      className="flex h-full flex-col gap-1.5 rounded-xl border border-border bg-card p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm text-muted-foreground">
          {label} <span className="text-xs">({unit})</span>
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-11"
          aria-label={`Agrandir ${label}`}
          disabled={!hasData}
          onClick={onExpand}
        >
          <ExpandIcon aria-hidden />
        </Button>
      </div>

      {hasData ? <TileBody summary={summary} unit={unit} /> : <TileEmptyState /> }
    </div>
  )
}

function TileBody({
  summary,
  unit,
}: {
  summary: MeasureSummary
  unit: string
}) {
  const direction = trendDirection(summary.trend)
  const TrendIcon = TREND_ICONS[direction]
  const tone = direction === 'up' ? 'text-success' : direction === 'down' ? 'text-danger' : 'text-muted-foreground'
  const paths = buildSparklinePaths(summary.sparkline, SPARKLINE_WIDTH, SPARKLINE_HEIGHT)
  const excursions = summary.excursions

  return (
    <>
      <div className="flex items-baseline gap-1">
        <span className="font-display font-extrabold text-2xl leading-none text-primary-text tabular-nums">
          {formatMeasureValue(summary.last, summary.decimals)}
        </span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </div>

      <p className={cn('flex items-center gap-1 text-xs', tone)}>
        <TrendIcon aria-hidden className="size-3" />
        <span className="tabular-nums">{formatChange24hLabel(summary.change24h, summary.decimals, unit)}</span>
      </p>

      {paths ? (
        <svg
          aria-hidden
          viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
          className="h-8 w-full text-primary-text"
          preserveAspectRatio="none"
        >
          <path d={paths.area} fill="currentColor" opacity={0.12} stroke="none" />
          <path d={paths.line} fill="none" stroke="currentColor" strokeWidth={1.5} />
        </svg>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">{formatMinMaxFooter(summary.min, summary.max, summary.decimals, unit)}</span>
        {excursions && excursions.count > 0 ? (
          <Badge variant="warning" data-testid="measure-tile-excursions">
            {formatExcursionsBadge(excursions, summary.decimals, unit)}
          </Badge>
        ) : null}
      </div>
    </>
  )
}

function TileEmptyState() {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-1 py-1">
      <span className="font-display font-extrabold text-2xl leading-none text-muted-foreground">—</span>
      <p className="text-xs text-muted-foreground">Aucune mesure sur cette période</p>
    </div>
  )
}

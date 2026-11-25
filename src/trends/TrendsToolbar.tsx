import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/ui/popover'
import type { TrendsRisk, TrendsSummary } from '../api/trends'
import { RISK_META, formatNumber } from './trendsData'

export interface TrendsToolbarProps {
  summary: TrendsSummary
  riskFilter: TrendsRisk | null
  onRiskFilter: (risk: TrendsRisk | null) => void
}

const TONE: Record<'eleve' | 'moyen', string> = { eleve: 'text-danger', moyen: 'text-warning' }

/** KAN-256 — one row: clickable risk counts + next expiry (segments only when > 0), methodology popover. */
export function TrendsToolbar({ summary, riskFilter, onRiskFilter }: TrendsToolbarProps) {
  const count = (risk: 'eleve' | 'moyen', text: string) => {
    const active = riskFilter === risk
    return (
      <Button
        variant="ghost"
        size="xs"
        aria-pressed={active}
        data-testid={`trends-filter-${risk}`}
        onClick={() => onRiskFilter(active ? null : risk)}
        className={cn('text-sm font-normal text-muted-foreground', active && 'bg-accent text-foreground')}
      >
        <span className={cn('font-semibold', TONE[risk])}>{summary[risk]}</span> {text}
      </Button>
    )
  }

  const segments = [
    summary.eleve > 0 && count('eleve', summary.eleve > 1 ? 'lots à risque élevé' : 'lot à risque élevé'),
    summary.moyen > 0 && count('moyen', 'moyen'),
    summary.nextExpiryDays !== null && (
      <span>
        prochaine péremption dans <span className="font-semibold text-foreground">{formatNumber(summary.nextExpiryDays, 0)} j</span>
      </span>
    ),
  ].filter(Boolean)

  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-1" data-testid="trends-toolbar">
      <p className="flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground tabular-nums" aria-live="polite">
        {segments.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>·</span>}
            {s}
          </span>
        ))}
      </p>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Méthodologie du score de risque">
            <Info aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 text-sm">
          <PopoverHeader>
            <PopoverTitle>Méthodologie</PopoverTitle>
            <PopoverDescription>Valeurs enregistrées par lot ; rien n’est recalculé à l’affichage.</PopoverDescription>
          </PopoverHeader>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
            <dt className="text-muted-foreground">Vitesse requise</dt>
            <dd>solde restant / jours avant péremption</dd>
            <dt className="text-muted-foreground">Score z</dt>
            <dd>(Vreq − Vref) / dispersion</dd>
            <dt className="text-muted-foreground">Seuils</dt>
            <dd className="flex flex-col">
              <span>{RISK_META.faible.glyph} {RISK_META.faible.label} : z ≤ 0</span>
              <span>{RISK_META.moyen.glyph} {RISK_META.moyen.label} : 0 &lt; z ≤ 1</span>
              <span>{RISK_META.eleve.glyph} {RISK_META.eleve.label} : z &gt; 1</span>
            </dd>
          </dl>
        </PopoverContent>
      </Popover>
    </div>
  )
}

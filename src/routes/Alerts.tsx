import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BellOff, X } from 'lucide-react'
import { fetchAnomalies, type AnomalyRow } from '../api/anomalies'
import { sortAnomalies, TYPE_LABEL, TYPE_ORDER, typeKeyOf, type TypeKey } from '../anomalies/anomalyCard'
import { STATUS_FILTER_OPTIONS, statusesForFilter, type StatusFilter } from '../anomalies/anomalyFormat'
import { TYPE_ICON } from '../anomalies/AnomalyList'
import { toggleType } from '../anomalies/ContractAnomalies'
import { useLoad } from '../anomalies/useLoad'
import { useIsMobile } from '@/hooks/use-mobile'
import { Alert, AlertDescription } from '@/ui/alert'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/ui/empty'
import { SELECTED_TOGGLE } from '@/ui/patterns/period-control'
import { ShellBreadcrumb } from '@/ui/patterns/shell-breadcrumb'
import { ShellPageTitle } from '@/ui/patterns/shell-title'
import { Skeleton } from '@/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/ui/tooltip'
import { AlertsContractGate } from './AlertsContractGate'
import { AlertsTable } from './AlertsTable'

/** Every status, fetched once: the status filter, its counts and the type chips all come from the same rows. */
const ALL = statusesForFilter('all')

const STATUS_PARAM = 'statut'
const TYPE_PARAM = 'type'
const DEVICE_PARAM = 'device'

function parseStatus(value: string | null): StatusFilter {
  return STATUS_FILTER_OPTIONS.some((option) => option.value === value) ? (value as StatusFilter) : 'open'
}

function parseTypes(value: string | null): Set<TypeKey> | null {
  const keys = (value ?? '').split(',').filter((key): key is TypeKey => TYPE_ORDER.includes(key as TypeKey))
  return keys.length > 0 ? new Set(keys) : null
}

function byStatus(rows: AnomalyRow[], filter: StatusFilter) {
  const allowed = new Set(statusesForFilter(filter))
  return rows.filter((row) => allowed.has(row.status))
}

function ListSkeleton() {
  return (
    <div data-testid="alerts-loading" role="status" aria-busy className="flex flex-col gap-2">
      <span className="sr-only">Chargement des alertes…</span>
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  )
}

/**
 * The filterable alerts list. `device` pins it to one device (the device's own alerts page): the `?device=`
 * param, its chip and its reset are then left out.
 */
export function AlertsList({ contractId, device: fixedDevice }: { contractId: number; device?: string }) {
  const [params, setParams] = useSearchParams()
  const isMobile = useIsMobile()
  const status = parseStatus(params.get(STATUS_PARAM))
  const types = parseTypes(params.get(TYPE_PARAM))
  const device = fixedDevice ?? params.get(DEVICE_PARAM)
  /** A removable `?device=` filter on the contract-wide list. */
  const deviceFilter = fixedDevice === undefined && device !== null

  const load = useCallback(() => fetchAnomalies(contractId, ALL), [contractId])
  const { state, reload } = useLoad(load)

  /** Writes one filter into the URL (the default value drops its param); a replace, so back leaves the page. */
  const update = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [key, value] of Object.entries(changes)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  const view = useMemo(() => {
    const loaded = state.status === 'ready' ? state.value : []
    const ofDevice = device === null ? loaded : loaded.filter((row) => row.chipId === device)
    const tabRows = byStatus(ofDevice, status)
    const typeCounts = new Map<TypeKey, number>()
    for (const row of tabRows) typeCounts.set(typeKeyOf(row.code), (typeCounts.get(typeKeyOf(row.code)) ?? 0) + 1)
    const typeChips = TYPE_ORDER.filter((key) => typeCounts.has(key)).map((key) => ({ key, count: typeCounts.get(key) ?? 0 }))
    // The type filter only applies while its chips are on screen (two types at least).
    const typeFiltered = typeChips.length > 1 && types !== null
    const rows = typeFiltered ? tabRows.filter((row) => types.has(typeKeyOf(row.code))) : tabRows
    return {
      counts: Object.fromEntries(STATUS_FILTER_OPTIONS.map(({ value }) => [value, byStatus(ofDevice, value).length])) as Record<StatusFilter, number>,
      typeChips: typeChips.length > 1 ? typeChips : [],
      typeFiltered,
      rows: sortAnomalies(rows),
    }
  }, [state, device, status, types])

  const ready = state.status === 'ready'
  const statusEmpty = STATUS_FILTER_OPTIONS.find((option) => option.value === status)?.empty ?? 'Aucune alerte'

  let body
  if (state.status === 'loading') body = <ListSkeleton />
  else if (state.status === 'error') {
    body = (
      <Alert variant="danger" data-testid="alerts-error">
        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
          Impossible de charger les alertes.
          <Button variant="outline" size="sm" onClick={reload}>
            Réessayer
          </Button>
        </AlertDescription>
      </Alert>
    )
  } else if (view.rows.length === 0) {
    body = (
      <Empty data-testid="alerts-empty" data-reason={view.typeFiltered ? 'type' : deviceFilter ? 'device' : 'status'}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BellOff aria-hidden />
          </EmptyMedia>
          <EmptyDescription>
            {view.typeFiltered
              ? 'Aucune alerte pour ces types.'
              : fixedDevice !== undefined
                ? `${statusEmpty} pour ce device.`
                : deviceFilter
                  ? `${statusEmpty} pour le device ${device}.`
                  : `${statusEmpty}.`}
          </EmptyDescription>
        </EmptyHeader>
        <div className="flex flex-wrap justify-center gap-2">
          {view.typeFiltered && (
            <Button variant="outline" size="sm" onClick={() => update({ [TYPE_PARAM]: null })} data-testid="alerts-types-reset">
              Réinitialiser les types
            </Button>
          )}
          {status === 'open' && view.counts.all > view.counts.open && (
            <Button variant="outline" size="sm" onClick={() => update({ [STATUS_PARAM]: 'all' })} data-testid="alerts-show-all">
              Afficher aussi les clôturées
            </Button>
          )}
          {deviceFilter && (
            <Button variant="outline" size="sm" onClick={() => update({ [DEVICE_PARAM]: null })} data-testid="alerts-device-reset">
              Retirer le filtre device
            </Button>
          )}
        </div>
      </Empty>
    )
  } else body = <AlertsTable rows={view.rows} mobile={isMobile} hideDevice={fixedDevice !== undefined} />

  return (
    <TooltipProvider>
      <div className="flex min-w-0 flex-col gap-4" data-testid="alerts-page">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2" data-testid="alerts-filters">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={0}
            value={status}
            onValueChange={(next) => next && update({ [STATUS_PARAM]: next === 'open' ? null : next })}
            aria-label="Filtrer par statut"
            className="bg-muted"
            data-testid="alerts-status-filter"
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} className={SELECTED_TOGGLE} data-testid={`alerts-status-${option.value}`}>
                {option.label}
                {ready && (
                  <span className="tabular-nums" data-testid={`alerts-status-count-${option.value}`}>
                    {view.counts[option.value]}
                  </span>
                )}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          {ready && view.typeChips.length > 0 && (
            <div role="group" aria-label="Filtrer par type" className="flex flex-wrap gap-1" data-testid="alerts-type-filter">
              {view.typeChips.map(({ key, count }) => {
                const Icon = TYPE_ICON[key]
                const pressed = types === null || types.has(key)
                return (
                  <Tooltip key={key}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={pressed ? 'secondary' : 'outline'}
                        size="sm"
                        aria-pressed={pressed}
                        onClick={() => {
                          const next = toggleType(types, key)
                          update({ [TYPE_PARAM]: next ? TYPE_ORDER.filter((type) => next.has(type)).join(',') : null })
                        }}
                        data-testid={`alerts-type-${key}`}
                      >
                        <Icon aria-hidden />
                        <span className="max-sm:sr-only">{TYPE_LABEL[key]}</span>
                        <span className="tabular-nums">{count}</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{TYPE_LABEL[key]}</TooltipContent>
                  </Tooltip>
                )
              })}
            </div>
          )}

          {deviceFilter && (
            <Badge variant="outline" className="h-7 gap-1 pr-1 text-sm font-normal" data-testid="alerts-device-chip">
              <span>
                Device <span className="font-mono font-medium">{device}</span>
              </span>
              <Button variant="ghost" size="icon-xs" aria-label={`Retirer le filtre device ${device}`} onClick={() => update({ [DEVICE_PARAM]: null })} data-testid="alerts-device-remove">
                <X aria-hidden />
              </Button>
            </Badge>
          )}

          {ready && (
            <p className="text-sm text-muted-foreground tabular-nums max-md:sr-only md:ml-auto" aria-live="polite" data-testid="alerts-count">
              {view.rows.length} {view.rows.length > 1 ? 'alertes' : 'alerte'}
            </p>
          )}
        </div>

        <div className="min-w-0">{body}</div>
      </div>
    </TooltipProvider>
  )
}

/**
 * Alerts, the full page (PAT-LIST): every anomaly of the selected contract as the kit `DataTable` (a `MobileList`
 * below md), with the Pulse rail's status and type filters and an optional `?device=` filter (linked from a
 * device's page). Open alerts by default; "Clôturées" / "Toutes" include the closed ones. The filters live in
 * the URL, so a view can be shared and the detail's back button returns to it. One click opens `alertPath`.
 */
export function Alerts() {
  return (
    <div className="flex flex-col">
      <h1 className="sr-only">Alertes</h1>
      <ShellPageTitle>
        <ShellBreadcrumb levels={[{ label: 'Alertes', testId: 'breadcrumb-alerts' }]} />
      </ShellPageTitle>
      <div className="flex flex-col gap-6 p-4 md:p-6">
        <AlertsContractGate>{(contractId) => <AlertsList key={contractId} contractId={contractId} />}</AlertsContractGate>
      </div>
    </div>
  )
}

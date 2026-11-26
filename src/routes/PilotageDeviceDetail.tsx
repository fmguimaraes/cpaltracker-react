import { SkeletonRows } from '@/ui/patterns/skeleton-rows'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import type { Position } from '../api/positions'
import { fetchAnomalies, type AnomalyRow } from '../api/anomalies'
import { anomalyCardContent, cardHeadline, formatCoordinates, formatMeasure, sortAnomalies } from '../anomalies/anomalyCard'
import { TYPE_ICON } from '../anomalies/AnomalyList'
import { StatusPill } from '../anomalies/StatusPill'
import { useContracts } from '../contracts/ContractContext'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { cn } from '@/lib/utils'
import { alertPath, deviceAlertsPath, deviceReadingsPath, DEVICE_PILOTAGE_PATH } from '../auth/paths'
import { DeviceStatusDot, lastSeenText, lastSeenTitle } from '../pilotage/DeviceList'
import { SettingsForm } from '../pilotage/SettingsForm'
import { TransferForm } from '../pilotage/TransferForm'
import type { PilotageOutletContext } from './DevicePilotage'

/**
 * One device's own page (`/pilotage/:chipId`), opened from a row of `PilotageDeviceList`.
 *
 * PAT-DETAIL (ui-guidelines.md): the anomaly/pallet header rhythm, then a grid-12 body — the
 * configuration (the page's main task) on 7–8 columns, and a side column (5–4) with the latest
 * readings and the short transfer task. Sections are divider + uppercase label, never a card
 * around a form. Below `lg` everything stacks, latest readings first.
 */

/** PAT-DETAIL section: a 1 px divider, 20 px top / 16 px bottom, 8 px under the uppercase title. */
export function Section({
  title,
  testId,
  className,
  action,
  children,
}: {
  title: string
  testId: string
  className?: string
  /** Optional: a link or button right-aligned on the title row. */
  action?: ReactNode
  children: ReactNode
}) {
  const heading = <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">{title}</h3>
  return (
    <section
      className={cn('flex min-w-0 flex-col gap-2 border-t border-border pt-5 pb-4', className)}
      aria-label={title}
      data-testid={testId}
    >
      {action ? (
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          {heading}
          {action}
        </div>
      ) : (
        heading
      )}
      {children}
    </section>
  )
}

const READINGS = [
  { key: 'ambientTemperature', label: 'Température', unit: '°C', icon: TYPE_ICON.temperature },
  { key: 'humidity', label: 'Humidité', unit: '%HR', icon: TYPE_ICON.humidity },
  { key: 'accelG', label: 'Accélération', unit: 'g', icon: TYPE_ICON.shock },
  { key: 'mass', label: 'Poids', unit: 'kg', icon: TYPE_ICON.mass },
] as const

/** Same tiles as the anomaly view's "Relevés" (icon, value, unit in a bordered `h-14` box). */
function LatestReadings({ device }: { device: Position }) {
  const tiles = READINGS.filter(({ key }) => device[key] !== null)
  const hasPosition = device.latitude !== null && device.longitude !== null
  const PositionIcon = TYPE_ICON.geofence

  if (tiles.length === 0 && !hasPosition) {
    return <p className="text-sm text-muted-foreground">Aucun relevé connu pour ce device.</p>
  }

  return (
    <ul className="grid grid-cols-2 gap-2">
      {tiles.map(({ key, label, unit, icon: Icon }) => (
        <li
          key={key}
          className="flex h-14 min-w-0 flex-col justify-center rounded-md border border-border px-2.5"
          data-testid={`pilotage-device-reading-${key}`}
        >
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium tabular-nums" title={label}>
            <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">{label} </span>
            <span className="truncate">{formatMeasure(device[key] as number, unit)}</span>
          </span>
          <span className="truncate pl-5.5 text-xs text-muted-foreground">{label}</span>
        </li>
      ))}
      {hasPosition && (
        <li
          className="col-span-2 flex h-14 min-w-0 flex-col justify-center rounded-md border border-border px-2.5"
          data-testid="pilotage-device-reading-position"
        >
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium tabular-nums" title="Position">
            <PositionIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">Position </span>
            <span className="truncate">
              {formatCoordinates({ lat: device.latitude as number, lng: device.longitude as number })}
            </span>
          </span>
          <span className="truncate pl-5.5 text-xs text-muted-foreground">Position</span>
        </li>
      )}
    </ul>
  )
}

/** The section action style: a muted-to-primary text link, "Voir … →". */
export const SECTION_LINK_CLASS = 'shrink-0 text-xs font-medium text-primary-text hover:underline'

/** Open alerts of one device on the selected contract; a fetch failure is a state, never a throw. */
type DeviceAlerts = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: AnomalyRow[] }

/**
 * Fetched here, not in `DevicePilotage`: only this page shows alerts (the list and the readings page
 * do not), so a layout-level fetch would cost every pilotage page a request for one consumer. Open =
 * detected or in progress (a provisionally closed alert reads as "Clôturée" everywhere else).
 */
function useDeviceAlerts(contractId: number | null, chipId: string): DeviceAlerts {
  const [state, setState] = useState<{ key: string; alerts: DeviceAlerts } | null>(null)
  const key = `${contractId}/${chipId}`
  useEffect(() => {
    if (contractId === null) return
    let cancelled = false
    fetchAnomalies(contractId, ['detectee', 'en_cours'])
      .then((rows) => {
        if (cancelled) return
        const own = sortAnomalies(rows.filter((row) => row.chipId === chipId && (row.status === 'detectee' || row.status === 'en_cours')))
        setState({ key, alerts: { status: 'ready', rows: own } })
      })
      .catch(() => {
        if (!cancelled) setState({ key, alerts: { status: 'error' } })
      })
    return () => {
      cancelled = true
    }
  }, [contractId, chipId, key])
  return state?.key === key ? state.alerts : { status: 'loading' }
}

function alertsLabel(count: number) {
  return `${count} ${count > 1 ? 'alertes ouvertes' : 'alerte ouverte'}`
}

/** Header badge: danger + link when alerts are open, muted text when none; nothing while unknown. */
function AlertIndicator({ alerts, chipId }: { alerts: DeviceAlerts; chipId: string }) {
  if (alerts.status === 'loading') return null
  let indicator: ReactNode
  if (alerts.status === 'error') {
    indicator = (
      <span data-testid="pilotage-device-alerts-indicator" data-state="unknown">
        Alertes indisponibles
      </span>
    )
  } else if (alerts.rows.length === 0) {
    indicator = (
      <span data-testid="pilotage-device-alerts-indicator" data-state="none">
        Aucune alerte ouverte
      </span>
    )
  } else {
    indicator = (
      <Badge variant="danger" asChild>
        <Link to={deviceAlertsPath(chipId)} data-testid="pilotage-device-alerts-indicator" data-state="open">
          {alertsLabel(alerts.rows.length)}
        </Link>
      </Badge>
    )
  }
  return (
    <>
      <span aria-hidden>·</span>
      {indicator}
    </>
  )
}

const ALERTS_SHOWN = 3

function AlertsSection({ alerts, chipId }: { alerts: DeviceAlerts; chipId: string }) {
  const now = useMemo(() => new Date(), [])
  const rows = alerts.status === 'ready' ? alerts.rows : []
  const more = rows.length > ALERTS_SHOWN
  return (
    <Section
      title="Alertes"
      testId="pilotage-device-alerts-section"
      className="max-lg:order-first"
      // Always there: the device's alerts page also holds its closed alerts.
      action={
        <Link to={deviceAlertsPath(chipId)} className={SECTION_LINK_CLASS} data-testid="pilotage-device-alerts-all">
          {more ? `Voir toutes (${rows.length}) →` : 'Toutes les alertes →'}
        </Link>
      }
    >
      {alerts.status === 'loading' && <SkeletonRows label="Chargement des alertes…" rows={3} rowClassName="h-10" />}
      {alerts.status === 'error' && (
        <p className="text-sm text-muted-foreground" data-testid="pilotage-device-alerts-error">
          Alertes indisponibles pour le moment.
        </p>
      )}
      {alerts.status === 'ready' && rows.length === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="pilotage-device-alerts-empty">
          Aucune alerte ouverte pour ce device.
        </p>
      )}
      {rows.length > 0 && (
        <ul className="flex flex-col gap-2">
          {rows.slice(0, ALERTS_SHOWN).map((row) => {
            const card = anomalyCardContent(row, { showName: false, now })
            const Icon = TYPE_ICON[card.rule?.kind ?? 'other']
            const headline = cardHeadline(card)
            return (
              <li key={row.anomalyKey} data-testid={`pilotage-device-alert-${row.anomalyKey}`}>
                <Link
                  to={alertPath(row.anomalyKey)}
                  className="flex min-w-0 flex-col gap-0.5 rounded-md border border-border border-l-4 px-2.5 py-1.5 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 truncate text-sm font-medium" title={card.ruleTooltip}>
                      {headline}
                    </span>
                    {card.excess && (
                      <span className="min-w-0 shrink-100 truncate text-xs font-medium tabular-nums">{card.excess}</span>
                    )}
                    <StatusPill status={row.status} className="ml-auto shrink-0" />
                  </span>
                  {card.time && (
                    <span className="truncate pl-5.5 text-xs text-muted-foreground" title={card.time.iso}>
                      {card.time.relative} · {card.time.absolute}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

export function PilotageDeviceDetail() {
  const { chipId = '' } = useParams<{ chipId: string }>()
  const { devices, addTransfer } = useOutletContext<PilotageOutletContext>()
  const navigate = useNavigate()
  const back = () => navigate(DEVICE_PILOTAGE_PATH)
  const { selectedId } = useContracts()
  const alerts = useDeviceAlerts(selectedId, chipId)
  const device = devices.find((candidate) => candidate.chipId === chipId)

  if (!device) {
    return (
      <Empty data-testid="pilotage-device-not-found">
        <EmptyHeader>
          <EmptyDescription>Aucun device « {chipId} » trouvé pour ce contrat.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <section aria-labelledby="pilotage-device-title" className="flex min-w-0 flex-col" data-testid="pilotage-device-page">
      <header className="flex min-w-0 flex-col gap-0.5 pb-3" data-testid="pilotage-device-header">
        <div className="flex min-w-0 items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="-ml-2 shrink-0"
            aria-label="Retour à la liste"
            title="Retour à la liste"
            onClick={back}
            data-testid="pilotage-device-back"
          >
            <ArrowLeft aria-hidden />
          </Button>
          <h2
            id="pilotage-device-title"
            className="min-w-0 truncate font-mono text-base font-semibold"
            title={chipId}
            data-testid="pilotage-device-title"
          >
            {chipId}
          </h2>
        </div>
        <p className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground" data-testid="pilotage-device-subtitle">
          <DeviceStatusDot device={device} />
          {device.timestamp && (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate" title={lastSeenTitle(device.timestamp)}>
                {lastSeenText(device.timestamp, new Date())}
              </span>
            </>
          )}
          <AlertIndicator alerts={alerts} chipId={chipId} />
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 lg:gap-x-10">
        <div className="flex min-w-0 flex-col lg:col-span-7 xl:col-span-8">
          <Section title="Configuration" testId="pilotage-device-settings-section">
            <SettingsForm deviceId={chipId} />
          </Section>
        </div>
        {/* Below lg its sections join the single column (`contents`), latest readings first. */}
        <div className="flex min-w-0 flex-col max-lg:contents lg:col-span-5 xl:col-span-4">
          <Section
            title="Dernier relevé"
            testId="pilotage-device-readings-section"
            className="max-lg:order-first"
            action={
              <Link to={deviceReadingsPath(chipId)} className={SECTION_LINK_CLASS} data-testid="pilotage-device-readings-all">
                Voir tous les relevés →
              </Link>
            }
          >
            <LatestReadings device={device} />
          </Section>
          <AlertsSection alerts={alerts} chipId={chipId} />
          <Section title="Transfert" testId="pilotage-device-transfer-section">
            <TransferForm deviceId={chipId} onTransferred={addTransfer} />
          </Section>
        </div>
      </div>
    </section>
  )
}

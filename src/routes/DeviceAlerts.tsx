import { ArrowLeft } from 'lucide-react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { devicePilotagePath } from '../auth/paths'
import { useContracts } from '../contracts/ContractContext'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { AlertsList } from './Alerts'
import type { PilotageOutletContext } from './DevicePilotage'

/**
 * Every alert of one device (PAT-LIST, `/pilotage/:chipId/alertes`), a child page of the device's page like its
 * readings: the alerts list (`AlertsList`) pinned to the device, with the same status and type filters in the
 * URL. Linked from the device page's alerts badge and section; a row opens the alert's page, whose back button
 * returns here. The breadcrumb ("Pilotage › CHIP › Alertes") is `DevicePilotage`'s.
 */
export function DeviceAlerts() {
  const { chipId = '' } = useParams<{ chipId: string }>()
  const { devices } = useOutletContext<PilotageOutletContext>()
  const { selectedId } = useContracts()
  const navigate = useNavigate()

  if (!devices.some((candidate) => candidate.chipId === chipId) || selectedId === null) {
    return (
      <Empty data-testid="pilotage-device-not-found">
        <EmptyHeader>
          <EmptyDescription>Aucun device « {chipId} » trouvé pour ce contrat.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <section aria-labelledby="device-alerts-title" className="flex min-w-0 flex-col gap-3" data-testid="device-alerts-page">
      <header className="flex min-w-0 items-center gap-1.5" data-testid="device-alerts-header">
        <Button
          variant="ghost"
          size="icon-sm"
          className="-ml-2 shrink-0"
          aria-label="Retour au device"
          title="Retour au device"
          onClick={() => navigate(devicePilotagePath(chipId))}
          data-testid="device-alerts-back"
        >
          <ArrowLeft aria-hidden />
        </Button>
        <h2 id="device-alerts-title" className="min-w-0 truncate text-base font-semibold" data-testid="device-alerts-title">
          Alertes · <span className="font-mono">{chipId}</span>
        </h2>
      </header>
      <AlertsList key={`${selectedId}/${chipId}`} contractId={selectedId} device={chipId} />
    </section>
  )
}

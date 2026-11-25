import type { ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { Button } from '@/ui/button'
import { Empty, EmptyDescription, EmptyHeader } from '@/ui/empty'
import { DEVICE_PILOTAGE_PATH } from '../auth/paths'
import { DeviceStatusDot, lastSeenText, lastSeenTitle } from '../pilotage/DeviceList'
import { SettingsForm } from '../pilotage/SettingsForm'
import { TransferForm } from '../pilotage/TransferForm'
import type { PilotageOutletContext } from './DevicePilotage'

/**
 * One device's own information page (`/pilotage/:chipId`) — replaces the former KAN-227 right drawer
 * (KAN-163's `SettingsForm` + KAN-169's `TransferForm`, both unchanged) with a standalone route that a
 * device's row in `PilotageDeviceList` navigates to, so the back button, a bookmark or a shared link
 * all land on the same device's configuration instead of needing the list page open to reach it.
 *
 * Layout: the same PAT-DETAIL header/section rhythm already used by the anomalies drawer detail
 * (`AnomalyDetailView.tsx`) — back button flush to the edge (`-ml-2`), a `gap-0.5 pb-3` header with
 * the title row then a muted subtitle row underneath, and each body section as an uppercase label over
 * a `border-t` divider (`Section` below) rather than a second, page-level card around the two PAT-FORM
 * cards `SettingsForm`/`TransferForm` already bring. Documented in `cpal.docs/engineering/ui-guidelines.md`
 * (PAT-DETAIL) as the shared detail-page convention.
 *
 * A `:chipId` outside this contract's device list (stale link, typo, device moved to another contract)
 * shows an explicit not-found state rather than a device picked without the API ever having confirmed it.
 */

/** PAT-DETAIL's body rhythm: a 1 px divider, 20 px top / 16 px bottom, 8 px under the uppercase title. */
function Section({ title, testId, children }: { title: string; testId: string; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2 border-t border-border pt-5 pb-4" aria-label={title} data-testid={testId}>
      <h3 className="text-xs font-semibold tracking-wider text-foreground uppercase">{title}</h3>
      {children}
    </section>
  )
}

export function PilotageDeviceDetail() {
  const { chipId = '' } = useParams<{ chipId: string }>()
  const { devices, addTransfer } = useOutletContext<PilotageOutletContext>()
  const navigate = useNavigate()
  const back = () => navigate(DEVICE_PILOTAGE_PATH)
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
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" data-testid="pilotage-device-subtitle">
          <DeviceStatusDot device={device} />
          {device.timestamp && (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate" title={lastSeenTitle(device.timestamp)}>
                {lastSeenText(device.timestamp, new Date())}
              </span>
            </>
          )}
        </p>
      </header>

      <Section title="Configuration" testId="pilotage-device-settings-section">
        <SettingsForm deviceId={chipId} />
      </Section>
      <Section title="Transfert" testId="pilotage-device-transfer-section">
        <TransferForm deviceId={chipId} onTransferred={addTransfer} />
      </Section>
    </section>
  )
}

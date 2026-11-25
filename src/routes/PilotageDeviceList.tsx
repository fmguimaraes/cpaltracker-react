import { useNavigate, useOutletContext } from 'react-router-dom'
import { devicePilotagePath } from '../auth/paths'
import { DeviceList } from '../pilotage/DeviceList'
import { TransferHistory } from '../pilotage/TransferHistory'
import type { PilotageOutletContext } from './DevicePilotage'

/**
 * `DevicePilotage`'s index route: the device table (KAN-227 FR10) and, under it, the contract's
 * session transfer-history log (KAN-169 FR18/CB29) — unchanged from the former `PilotageWorkspace`,
 * except that picking a device now navigates to its own page (`PilotageDeviceDetail`, `/pilotage/:chipId`)
 * instead of opening a right drawer in place.
 */
export function PilotageDeviceList() {
  const { devices, transferHistory } = useOutletContext<PilotageOutletContext>()
  const navigate = useNavigate()

  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="pilotage-workspace">
      <DeviceList devices={devices} onSelect={(chipId) => navigate(devicePilotagePath(chipId))} />
      <div data-testid="pilotage-transfer-history">
        <TransferHistory entries={transferHistory} />
      </div>
    </div>
  )
}

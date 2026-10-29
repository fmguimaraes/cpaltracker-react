import type { DeviceStatus } from '@/ui/status'

/** FR8: the four states in display order, with the labels the reference's
 * live pattern uses (French, like the rest of this page). */
export const STATES: DeviceStatus[] = ['ok', 'warning', 'alert', 'offline']

export const STATE_LABEL: Record<DeviceStatus, string> = {
  ok: 'OK',
  warning: 'Avertissement',
  alert: 'Alerte',
  offline: 'Hors ligne',
}

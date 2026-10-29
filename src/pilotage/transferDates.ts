import { format } from 'date-fns'

/**
 * The wire format of the transfer dates: `AAAA-MM-JJTHH:MM`, the value of the monolith's
 * `datetime-local` fields (pilotage.php `date_init` / `date_end`, "(UTC)"), which is the only
 * shape `cpal_pilotage_date_sql()` (pilotage_logic.php) accepts behind
 * `POST /devices/{deviceId}/transfer`. The wall-clock date and time the operator picked are sent
 * as typed (they are UTC, as in the monolith); no time-zone conversion.
 */
export function toTransferDateTime(value: Date): string {
  return format(value, "yyyy-MM-dd'T'HH:mm")
}

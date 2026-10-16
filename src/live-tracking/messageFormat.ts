/**
 * KAN-165 (FR11/FR12) — formats a message's ISO-8601 `date` as
 * `dd/mm/YYYY HH:mm`, matching the legacy `index.php` display
 * (`date('d/m/Y H:i', strtotime(...))`). Falls back to an empty string
 * for a missing/unparseable date rather than a bogus one.
 *
 * Uses the UTC getters (`getUTCDate`, etc.), not the local ones, so the
 * rendered time doesn't shift with the viewer's own timezone — same
 * convention `positionTooltip.ts`'s `formatUtc()` already established
 * for `/devices/positions.php`'s timestamps (CB-18), applied here to the
 * `/api/v1/messages/*` endpoints' own ISO-8601-UTC `date` field.
 */
export function formatMessageDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

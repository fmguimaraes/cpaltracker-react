import type { SettingsFieldDef } from './settingsFields'

/**
 * KAN-163 (FR9, FR10; CB13, CB14) — client-side mirror of
 * `cpaltracker.web/pilotage_logic.php`'s `cpal_pilotage_valider_champ()`,
 * and the single source of the form's validation rules. This is a
 * convenience mirror only: the API remains the authoritative validator
 * (FR9's own wording) — a value this function accepts can still be rejected
 * server-side, and that is fine.
 *
 * Rules, in order: blank -> keep (never an error); max 100 characters;
 * format (integer for `uint8`/`uint16`, decimal for `float`, a decimal comma
 * accepted and normalized to a dot); the type's own range (`uint8` <= 255,
 * `uint16` <= 65535); then the field's physical bounds (`def.min`/`def.max`,
 * e.g. humidity 0-100, latitude -90..90).
 *
 * Blank input (CB14/FR10) is reported as `{ value: null }` — "keep the
 * device's last known value" — never as an error, and never coerced to an
 * empty string (which the server would store as a real value, not "no
 * change").
 */
export type SettingsFieldValidation = { value: string | null } | { error: string }

const MAX_LENGTH = 100
const INTEGER = /^\d+$/
const DECIMAL = /^[+-]?(\d+([.,]\d+)?|[.,]\d+)$/

export function validateSettingsField(raw: string, def: SettingsFieldDef): SettingsFieldValidation {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { value: null }
  }
  if (trimmed.length > MAX_LENGTH) {
    return { error: `${def.label} : valeur trop longue (${MAX_LENGTH} caractères maximum).` }
  }

  switch (def.type) {
    case 'uint8':
    case 'uint16': {
      if (!INTEGER.test(trimmed)) {
        return { error: `${def.label} : un entier positif est attendu.` }
      }
      const typeMax = def.type === 'uint8' ? 255 : 65535
      const number = Number(trimmed)
      if (number > typeMax) {
        return { error: `${def.label} : la valeur maximale est ${typeMax}.` }
      }
      const bounds = checkBounds(number, def)
      return bounds ?? { value: String(number) }
    }

    case 'float': {
      // CB13: a decimal comma is tolerated on input, never stored — the
      // firmware (and the API) expect a dot.
      if (!DECIMAL.test(trimmed)) {
        return { error: `${def.label} : un nombre décimal est attendu (ex. 12,5).` }
      }
      const normalized = trimmed.replace(',', '.').replace(/^\+/, '')
      const number = Number(normalized)
      if (!Number.isFinite(number)) {
        return { error: `${def.label} : un nombre décimal est attendu (ex. 12,5).` }
      }
      return checkBounds(number, def) ?? { value: normalized }
    }

    default:
      return { error: `${def.label} : type inconnu.` }
  }
}

/** Physical bounds of the field (`min`/`max`, inclusive), as an error or `null` when within range. */
function checkBounds(number: number, def: SettingsFieldDef): { error: string } | null {
  const { min, max } = def
  const unit = def.unit ? ` ${def.unit}` : ''
  if (min !== undefined && max !== undefined && (number < min || number > max)) {
    return { error: `${def.label} : la valeur doit être comprise entre ${min} et ${max}${unit}.` }
  }
  if (min !== undefined && number < min) {
    return { error: `${def.label} : la valeur minimale est ${min}${unit}.` }
  }
  if (max !== undefined && number > max) {
    return { error: `${def.label} : la valeur maximale est ${max}${unit}.` }
  }
  return null
}

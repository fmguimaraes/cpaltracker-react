import type { SettingsFieldDef } from './settingsFields'

/**
 * KAN-163 (FR9, FR10; CB13, CB14) — client-side mirror of
 * `cpaltracker.web/pilotage_logic.php`'s `cpal_pilotage_valider_champ()`.
 * This is a convenience mirror only: the API remains the authoritative
 * validator (FR9's own wording) — a value this function accepts can still
 * be rejected server-side, and that is fine.
 *
 * Blank input (CB14/FR10) is reported as `{ value: null }` — "keep the
 * device's last known value" — never as an error, and never coerced to an
 * empty string (which the server would store as a real value, not "no
 * change").
 */
export type SettingsFieldValidation = { value: string | null } | { error: string }

export function validateSettingsField(raw: string, def: SettingsFieldDef): SettingsFieldValidation {
  const trimmed = raw.trim()
  if (trimmed === '') {
    return { value: null }
  }

  switch (def.type) {
    case 'uint8':
    case 'uint16': {
      if (!/^\d+$/.test(trimmed)) {
        return { error: `${def.label} : un entier positif est attendu.` }
      }
      const max = def.type === 'uint8' ? 255 : 65535
      if (Number(trimmed) > max) {
        return { error: `${def.label} : la valeur maximale est ${max}.` }
      }
      return { value: String(Number(trimmed)) }
    }

    case 'float': {
      // CB13: a decimal comma is tolerated on input, never stored — the
      // firmware (and the API) expect a dot.
      const normalized = trimmed.replace(',', '.')
      if (!isNumericString(normalized)) {
        return { error: `${def.label} : un nombre est attendu (point décimal).` }
      }
      if (normalized.length > 100) {
        return { error: `${def.label} : valeur trop longue.` }
      }
      return { value: normalized }
    }

    default:
      return { error: `${def.label} : type inconnu.` }
  }
}

/** Mirrors PHP's `is_numeric()` closely enough for this field's input shape. */
function isNumericString(value: string): boolean {
  return value !== '' && !Number.isNaN(Number(value))
}

/**
 * KAN-163 (FR8, FR12; GAP6) — the authoritative settings-field list for the
 * pilotage settings form, ported verbatim from
 * `cpaltracker.web/pilotage_logic.php`'s `cpal_pilotage_reglages_champs()`
 * (labels, types and hints copied 1:1 — this is the one PHP-side source of
 * truth for both the field list and the client-validation rules it drives,
 * per that file's own header comment: "Une seule source de vérité").
 *
 * GAP6 split (feature spec FR8, technical doc CB9): the first 5 fields are
 * the ones `ttn_downlink_reglages.php` actually encodes into the device's
 * port-3 downlink (`TRANSMITTED_FIELDS`); the remaining 5 are persisted in
 * `T_REGLAGES` but never reach the device (`STORED_ONLY_FIELDS`). Both
 * groups are kept and rendered — never omitted — per the feature spec's
 * explicit decision not to make a destructive UI call the backend hasn't
 * confirmed (open question in `Device-Pilotage.md` §9).
 *
 * FR12 (CB16): `WiFi_SSID_CL`/`WiFi_PASS_CL` are deliberately absent from
 * this list — they are binary, server-only fields never exposed to the
 * browser, and are not part of `cpal_pilotage_reglages_champs()`'s own
 * client-facing field set either.
 */

export type SettingsFieldType = 'uint8' | 'uint16' | 'float'

/** How the form renders the field: a plain numeric input, an integer stepper, or a duration in minutes. */
export type SettingsFieldControl = 'number' | 'stepper' | 'duration'

export interface SettingsFieldPreset {
  label: string
  value: number
}

export interface SettingsFieldDef {
  /** Matches both `DeviceConfig.config`'s keys and the POST body's field names. */
  name: string
  label: string
  type: SettingsFieldType
  hint: string
  /** Control used by the form (default `number`). */
  control?: SettingsFieldControl
  /** Unit shown as an input suffix (and in range errors). Absent when the firmware unit is undocumented. */
  unit?: string
  /** Physical lower bound (inclusive), checked on top of the type's own range. */
  min?: number
  /** Physical upper bound (inclusive), checked on top of the type's own range. */
  max?: number
  /** Quick values for a `duration` control, in the field's own unit (minutes). */
  presets?: readonly SettingsFieldPreset[]
  /** Hardware default, used as the stepper's starting point when nothing is known. */
  defaultValue?: number
}

/** Human readout of a duration in minutes: 15 -> "15 min", 360 -> "6 h", 1500 -> "1 j 1 h". */
export function formatMinutes(total: number): string {
  if (!Number.isFinite(total) || total < 0) return ''
  if (total < 60) return `${total} min`
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  return [days && `${days} j`, hours && `${hours} h`, minutes && `${minutes} min`].filter(Boolean).join(' ')
}

export const TRANSMITTED_FIELDS: readonly SettingsFieldDef[] = [
  {
    name: 'FREQ_MESURE_CL',
    label: 'Fréquence de mesure',
    type: 'uint8',
    hint: 'entier de 0 à 255',
    control: 'stepper',
    min: 0,
    max: 255,
    defaultValue: 1,
  },
  {
    name: 'WAKEUP_ESP_CL',
    label: 'Réveil ESP',
    type: 'uint16',
    hint: 'durée en minutes, de 0 à 65535',
    control: 'duration',
    unit: 'min',
    min: 0,
    max: 65535,
    defaultValue: 5,
    presets: [
      { label: '15 min', value: 15 },
      { label: '1 h', value: 60 },
      { label: '6 h', value: 360 },
      { label: '24 h', value: 1440 },
    ],
  },
  {
    name: 'Seuil_TEMPAMB_CL',
    label: 'Seuil température ambiante',
    type: 'float',
    hint: 'maximum toléré, de −50 à 100 °C',
    unit: '°C',
    min: -50,
    max: 100,
  },
  {
    name: 'Seuil_HRAMB_CL',
    label: 'Seuil humidité relative',
    type: 'float',
    hint: 'maximum toléré, de 0 à 100 %',
    unit: '% HR',
    min: 0,
    max: 100,
  },
  {
    name: 'Seuil_MASSE_CL',
    label: 'Seuil de masse',
    type: 'float',
    hint: 'hausse maximale tolérée par rapport au relevé précédent, en kg',
    unit: 'kg',
    min: 0,
  },
]

export const STORED_ONLY_FIELDS: readonly SettingsFieldDef[] = [
  {
    name: 'SeuilG_CL',
    label: 'Seuil G',
    type: 'float',
    hint: 'nombre décimal positif, en G',
    unit: 'G',
    min: 0,
  },
  {
    name: 'Seuil_AccelG_CL',
    label: 'Seuil accélération',
    type: 'float',
    hint: 'nombre décimal positif, en G',
    unit: 'G',
    min: 0,
  },
  {
    name: 'Seuil_LONG_CL',
    label: 'Seuil longitude',
    type: 'float',
    hint: 'degrés décimaux, de −180 à 180',
    unit: '°',
    min: -180,
    max: 180,
  },
  {
    name: 'Seuil_LAT_CL',
    label: 'Seuil latitude',
    type: 'float',
    hint: 'degrés décimaux, de −90 à 90',
    unit: '°',
    min: -90,
    max: 90,
  },
  {
    name: 'Seuil_TEMPMPU_CL',
    label: 'Seuil tension batterie',
    type: 'float',
    hint: 'nombre décimal positif, en V',
    unit: 'V',
    min: 0,
  },
]

export const SETTINGS_FIELDS: readonly SettingsFieldDef[] = [
  ...TRANSMITTED_FIELDS,
  ...STORED_ONLY_FIELDS,
]

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

export interface SettingsFieldDef {
  /** Matches both `DeviceConfig.config`'s keys and the POST body's field names. */
  name: string
  label: string
  type: SettingsFieldType
  hint: string
}

export const TRANSMITTED_FIELDS: readonly SettingsFieldDef[] = [
  {
    name: 'FREQ_MESURE_CL',
    label: 'Fréquence de mesure',
    type: 'uint8',
    hint: 'entier de 0 à 255',
  },
  {
    name: 'WAKEUP_ESP_CL',
    label: 'Réveil ESP',
    type: 'uint16',
    hint: 'entier de 0 à 65535 minutes',
  },
  {
    name: 'Seuil_TEMPAMB_CL',
    label: 'Seuil température ambiante',
    type: 'float',
    hint: 'nombre décimal, en °C',
  },
  {
    name: 'Seuil_HRAMB_CL',
    label: 'Seuil humidité relative',
    type: 'float',
    hint: 'nombre décimal, de 0 à 100 %',
  },
  {
    name: 'Seuil_MASSE_CL',
    label: 'Seuil de masse',
    type: 'float',
    hint: 'nombre décimal',
  },
]

export const STORED_ONLY_FIELDS: readonly SettingsFieldDef[] = [
  {
    name: 'SeuilG_CL',
    label: 'Seuil G',
    type: 'float',
    hint: 'nombre décimal',
  },
  {
    name: 'Seuil_AccelG_CL',
    label: 'Seuil accélération',
    type: 'float',
    hint: 'nombre décimal, en G',
  },
  {
    name: 'Seuil_LONG_CL',
    label: 'Seuil longitude',
    type: 'float',
    hint: 'nombre décimal, degrés décimaux',
  },
  {
    name: 'Seuil_LAT_CL',
    label: 'Seuil latitude',
    type: 'float',
    hint: 'nombre décimal, degrés décimaux',
  },
  {
    name: 'Seuil_TEMPMPU_CL',
    label: 'Seuil tension batterie',
    type: 'float',
    hint: 'nombre décimal, en V',
  },
]

export const SETTINGS_FIELDS: readonly SettingsFieldDef[] = [
  ...TRANSMITTED_FIELDS,
  ...STORED_ONLY_FIELDS,
]

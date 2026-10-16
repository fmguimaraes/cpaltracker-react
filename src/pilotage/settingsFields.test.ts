import { describe, expect, it } from 'vitest'
import { SETTINGS_FIELDS, STORED_ONLY_FIELDS, TRANSMITTED_FIELDS } from './settingsFields'

describe('settingsFields (KAN-163 FR8, FR12; GAP6)', () => {
  it('splits the fields into exactly 5 transmitted and 5 stored-only (FR8)', () => {
    expect(TRANSMITTED_FIELDS).toHaveLength(5)
    expect(STORED_ONLY_FIELDS).toHaveLength(5)
    expect(SETTINGS_FIELDS).toHaveLength(10)
  })

  it('transmits exactly the 5 fields ttn_downlink_reglages.php actually encodes (CB9)', () => {
    expect(TRANSMITTED_FIELDS.map((f) => f.name)).toEqual([
      'FREQ_MESURE_CL',
      'WAKEUP_ESP_CL',
      'Seuil_TEMPAMB_CL',
      'Seuil_HRAMB_CL',
      'Seuil_MASSE_CL',
    ])
  })

  it('stores (but never transmits) exactly the other 5 fields (CB9, GAP6)', () => {
    expect(STORED_ONLY_FIELDS.map((f) => f.name)).toEqual([
      'SeuilG_CL',
      'Seuil_AccelG_CL',
      'Seuil_LONG_CL',
      'Seuil_LAT_CL',
      'Seuil_TEMPMPU_CL',
    ])
  })

  it('never includes the binary WiFi credential fields (FR12, CB16)', () => {
    const names = SETTINGS_FIELDS.map((f) => f.name)
    expect(names).not.toContain('WiFi_SSID_CL')
    expect(names).not.toContain('WiFi_PASS_CL')
  })

  it('has no duplicate field names across both groups', () => {
    const names = SETTINGS_FIELDS.map((f) => f.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

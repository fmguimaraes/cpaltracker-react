import { describe, expect, it } from 'vitest'
import { SETTINGS_FIELDS, STORED_ONLY_FIELDS, TRANSMITTED_FIELDS, formatMinutes } from './settingsFields'

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

  it('gives every field the control and unit that fit it', () => {
    const byName = Object.fromEntries(SETTINGS_FIELDS.map((f) => [f.name, f]))
    expect(byName.FREQ_MESURE_CL).toMatchObject({ control: 'stepper', min: 0, max: 255, defaultValue: 1 })
    expect(byName.FREQ_MESURE_CL.unit).toBeUndefined() // firmware unit undocumented: never invented
    expect(byName.WAKEUP_ESP_CL).toMatchObject({ control: 'duration', unit: 'min', defaultValue: 5 })
    expect(byName.WAKEUP_ESP_CL.presets?.map((p) => p.value)).toEqual([15, 60, 360, 1440])
    expect(byName.Seuil_TEMPAMB_CL).toMatchObject({ unit: '°C', min: -50, max: 100 })
    expect(byName.Seuil_HRAMB_CL).toMatchObject({ unit: '% HR', min: 0, max: 100 })
    expect(byName.Seuil_MASSE_CL).toMatchObject({ unit: 'kg', min: 0 })
    expect(byName.Seuil_LAT_CL).toMatchObject({ unit: '°', min: -90, max: 90 })
    expect(byName.Seuil_LONG_CL).toMatchObject({ unit: '°', min: -180, max: 180 })
    expect(byName.Seuil_TEMPMPU_CL).toMatchObject({ label: 'Seuil tension batterie', unit: 'V', min: 0 })
  })
})

describe('formatMinutes', () => {
  it('formats minutes as a compact human duration', () => {
    expect(formatMinutes(0)).toBe('0 min')
    expect(formatMinutes(15)).toBe('15 min')
    expect(formatMinutes(60)).toBe('1 h')
    expect(formatMinutes(90)).toBe('1 h 30 min')
    expect(formatMinutes(360)).toBe('6 h')
    expect(formatMinutes(1440)).toBe('1 j')
    expect(formatMinutes(1500)).toBe('1 j 1 h')
  })
})

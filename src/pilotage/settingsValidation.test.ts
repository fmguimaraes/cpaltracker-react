import { describe, expect, it } from 'vitest'
import type { SettingsFieldDef } from './settingsFields'
import { validateSettingsField } from './settingsValidation'

const uint8Field: SettingsFieldDef = {
  name: 'FREQ_MESURE_CL',
  label: 'Fréquence de mesure',
  type: 'uint8',
  hint: 'entier de 0 à 255',
}
const uint16Field: SettingsFieldDef = {
  name: 'WAKEUP_ESP_CL',
  label: 'Réveil ESP',
  type: 'uint16',
  hint: 'entier de 0 à 65535 minutes',
}
const floatField: SettingsFieldDef = {
  name: 'Seuil_TEMPAMB_CL',
  label: 'Seuil température ambiante',
  type: 'float',
  hint: 'nombre décimal, en °C',
}

describe('validateSettingsField (KAN-163 FR9, FR10; CB13, CB14)', () => {
  it('reports a blank field as "keep current value", not an error (FR10, CB14)', () => {
    expect(validateSettingsField('', uint8Field)).toEqual({ value: null })
    expect(validateSettingsField('   ', floatField)).toEqual({ value: null })
  })

  describe('uint8', () => {
    it('accepts an integer within range', () => {
      expect(validateSettingsField('42', uint8Field)).toEqual({ value: '42' })
      expect(validateSettingsField('255', uint8Field)).toEqual({ value: '255' })
    })

    it('rejects a value above 255 (CB13)', () => {
      const result = validateSettingsField('256', uint8Field)
      expect(result).toHaveProperty('error')
    })

    it('rejects a non-integer input', () => {
      expect(validateSettingsField('abc', uint8Field)).toHaveProperty('error')
      expect(validateSettingsField('1.5', uint8Field)).toHaveProperty('error')
      expect(validateSettingsField('-1', uint8Field)).toHaveProperty('error')
    })
  })

  describe('uint16', () => {
    it('accepts an integer within range', () => {
      expect(validateSettingsField('65535', uint16Field)).toEqual({ value: '65535' })
    })

    it('rejects a value above 65535 (CB13)', () => {
      expect(validateSettingsField('65536', uint16Field)).toHaveProperty('error')
    })
  })

  describe('float', () => {
    it('accepts a dot-decimal value', () => {
      expect(validateSettingsField('19.5', floatField)).toEqual({ value: '19.5' })
    })

    it('normalizes a comma decimal separator to a dot before storage (CB13)', () => {
      expect(validateSettingsField('19,5', floatField)).toEqual({ value: '19.5' })
    })

    it('rejects a non-numeric input', () => {
      expect(validateSettingsField('abc', floatField)).toHaveProperty('error')
    })

    it('rejects a value longer than 100 characters', () => {
      const long = '1'.repeat(101)
      expect(validateSettingsField(long, floatField)).toHaveProperty('error')
    })
  })

  describe('physical bounds', () => {
    const humidity: SettingsFieldDef = { name: 'Seuil_HRAMB_CL', label: 'Seuil humidité relative', type: 'float', hint: '', unit: '% HR', min: 0, max: 100 }
    const temperature: SettingsFieldDef = { name: 'Seuil_TEMPAMB_CL', label: 'Seuil température ambiante', type: 'float', hint: '', unit: '°C', min: -50, max: 100 }
    const latitude: SettingsFieldDef = { name: 'Seuil_LAT_CL', label: 'Seuil latitude', type: 'float', hint: '', unit: '°', min: -90, max: 90 }
    const longitude: SettingsFieldDef = { name: 'Seuil_LONG_CL', label: 'Seuil longitude', type: 'float', hint: '', unit: '°', min: -180, max: 180 }
    const mass: SettingsFieldDef = { name: 'Seuil_MASSE_CL', label: 'Seuil de masse', type: 'float', hint: '', unit: 'kg', min: 0 }

    it.each([
      [humidity, '0', true],
      [humidity, '100', true],
      [humidity, '100,5', false],
      [humidity, '-0,1', false],
      [temperature, '-50', true],
      [temperature, '100', true],
      [temperature, '-50,1', false],
      [temperature, '100.1', false],
      [latitude, '-90', true],
      [latitude, '90', true],
      [latitude, '90,01', false],
      [longitude, '-180', true],
      [longitude, '180', true],
      [longitude, '-180,5', false],
      [mass, '0', true],
      [mass, '12,5', true],
      [mass, '-1', false],
    ])('%o accepts or rejects %s', (def, raw, ok) => {
      const result = validateSettingsField(raw, def)
      expect('error' in result).toBe(!ok)
    })

    it('mentions the range and unit in the message', () => {
      expect(validateSettingsField('101', humidity)).toEqual({
        error: 'Seuil humidité relative : la valeur doit être comprise entre 0 et 100 % HR.',
      })
      expect(validateSettingsField('-3', mass)).toEqual({ error: 'Seuil de masse : la valeur minimale est 0 kg.' })
    })

    it('applies a field minimum to integers too, after the type range', () => {
      const wakeup: SettingsFieldDef = { ...uint16Field, min: 1, unit: 'min' }
      expect(validateSettingsField('0', wakeup)).toHaveProperty('error')
      expect(validateSettingsField('70000', wakeup)).toEqual({ error: 'Réveil ESP : la valeur maximale est 65535.' })
    })
  })

  describe('format', () => {
    it('rejects malformed decimals', () => {
      for (const bad of ['1e3', '1,2,3', '1.2.3', '12.', '--1', '0x10', '1 2', 'NaN', 'Infinity']) {
        expect(validateSettingsField(bad, floatField)).toHaveProperty('error')
      }
    })

    it('accepts signed and leading-dot decimals, trims, and strips a leading plus', () => {
      expect(validateSettingsField(' -3,25 ', floatField)).toEqual({ value: '-3.25' })
      expect(validateSettingsField('+4', floatField)).toEqual({ value: '4' })
      expect(validateSettingsField(',5', floatField)).toEqual({ value: '.5' })
    })

    it('rejects values longer than 100 characters for integers as well', () => {
      expect(validateSettingsField('1'.repeat(101), uint16Field)).toHaveProperty('error')
    })
  })
})

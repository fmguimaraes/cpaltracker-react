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
})

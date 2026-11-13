import { beforeEach, describe, expect, it } from 'vitest'
import type { Contract } from '../api/contracts'
import { defaultContractId, readStoredContractId, writeStoredContractId } from './rememberedContract'

const contracts = [{ contractId: 3 }, { contractId: 7 }] as Contract[]

describe('rememberedContract', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('uses the single shared key', () => {
    writeStoredContractId(7)
    expect(window.sessionStorage.getItem('cpaltracker:contract')).toBe('7')
    expect(readStoredContractId()).toBe(7)
  })

  it('clears on null and ignores invalid values', () => {
    writeStoredContractId(7)
    writeStoredContractId(null)
    expect(readStoredContractId()).toBeNull()
    window.sessionStorage.setItem('cpaltracker:contract', 'abc')
    expect(readStoredContractId()).toBeNull()
  })

  it('defaults to the stored contract when still listed', () => {
    writeStoredContractId(7)
    expect(defaultContractId(contracts)).toBe(7)
  })

  it('falls back to the first contract when the stored one is absent or nothing is stored', () => {
    expect(defaultContractId(contracts)).toBe(3)
    writeStoredContractId(99)
    expect(defaultContractId(contracts)).toBe(3)
    expect(defaultContractId([])).toBeNull()
  })
})

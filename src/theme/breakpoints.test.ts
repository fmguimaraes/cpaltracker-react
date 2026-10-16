import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { BREAKPOINTS } from './breakpoints'

const here = dirname(fileURLToPath(import.meta.url))
const tokensCss = readFileSync(join(here, 'tokens.css'), 'utf-8')

describe('BREAKPOINTS (KAN-167 FR7 — single reconciled breakpoint token set)', () => {
  it('defines exactly the two legacy cutoffs being reconciled (CB22: 768px styles.css vs 480px auth.css)', () => {
    expect(BREAKPOINTS).toEqual({ sm: 480, md: 768 })
  })

  it('stays byte-identical to the CSS @theme breakpoint tokens (no drift between the two sources of truth)', () => {
    expect(tokensCss).toMatch(/--breakpoint-sm:\s*480px/)
    expect(tokensCss).toMatch(/--breakpoint-md:\s*768px/)
  })

  it('exposes only the two reconciled breakpoints — no sibling convention snuck back in', () => {
    expect(Object.keys(BREAKPOINTS).sort()).toEqual(['md', 'sm'])
  })
})

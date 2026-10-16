import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const tokensCss = readFileSync(join(here, 'tokens.css'), 'utf-8')

function customPropertyNames(block: string): string[] {
  return Array.from(block.matchAll(/--([a-z0-9-]+):/g))
    .map((match) => match[1])
    .filter((name) => !name.startsWith('breakpoint-'))
}

function block(css: string, selector: string): string {
  const start = css.indexOf(selector)
  expect(start, `expected to find ${selector} block`).toBeGreaterThanOrEqual(0)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  return css.slice(open, close)
}

describe('tokens.css (KAN-167 FR5/FR6/NFR9 — centralized color/theme tokens)', () => {
  it('defines at minimum the CB16 palette roles (primary + hover state, bg/surface, border, text, danger/error, success)', () => {
    const lightBlock = block(tokensCss, ':root {')
    const names = customPropertyNames(lightBlock)

    expect(names).toContain('color-primary')
    expect(names).toContain('color-primary-hover')
    expect(names).toContain('color-bg')
    expect(names).toContain('color-border')
    expect(names).toContain('color-text')
    expect(names).toContain('color-danger')
    expect(names).toContain('color-success')
  })

  it('ships a dark theme (FR6) that redefines every light-theme color token under one data-theme switch (NFR9)', () => {
    const lightBlock = block(tokensCss, ':root {')
    const darkBlock = block(tokensCss, ":root[data-theme='dark']")

    const lightColorNames = customPropertyNames(lightBlock).filter((name) => name.startsWith('color-'))
    const darkColorNames = customPropertyNames(darkBlock).filter((name) => name.startsWith('color-'))

    expect(darkColorNames.sort()).toEqual(lightColorNames.sort())
  })

  it('switches theme via a single selector keyed on the data-theme attribute, not a per-component conditional (NFR9)', () => {
    expect(tokensCss).toContain(":root[data-theme='dark']")
  })

  it('declares the reconciled breakpoint tokens through Tailwind v4 @theme, not as inert :root custom properties', () => {
    const themeBlockIndex = tokensCss.indexOf('@theme')
    expect(themeBlockIndex).toBeGreaterThanOrEqual(0)
    const themeBlockEnd = tokensCss.indexOf('}', themeBlockIndex)
    const themeBlock = tokensCss.slice(themeBlockIndex, themeBlockEnd)

    expect(themeBlock).toContain('--breakpoint-sm: 480px')
    expect(themeBlock).toContain('--breakpoint-md: 768px')
  })

  it('inverts the Leaflet tile pane only (never markers/trail/tooltips) in dark mode (FR26)', () => {
    expect(tokensCss).toMatch(
      /:root\[data-theme='dark'\]\s+\.timeline-map\s+\.leaflet-tile-pane\s*\{\s*filter:\s*invert\(1\)/,
    )
  })
})

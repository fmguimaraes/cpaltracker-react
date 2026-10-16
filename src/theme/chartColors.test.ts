import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CHART_COLORS } from './chartColors'

const here = dirname(fileURLToPath(import.meta.url))
const tokensCss = readFileSync(join(here, 'tokens.css'), 'utf-8')

function lightBlock(css: string): string {
  const rootIndex = css.indexOf(':root {')
  const end = css.indexOf('}', rootIndex)
  return css.slice(rootIndex, end)
}

function darkBlock(css: string): string {
  const darkIndex = css.indexOf(":root[data-theme='dark']")
  const end = css.indexOf('}', darkIndex)
  return css.slice(darkIndex, end)
}

describe('CHART_COLORS (KAN-176 FR26 — Plotly dark/light theme mirror)', () => {
  it('stays byte-identical to tokens.css for both themes (no drift between the two sources of truth)', () => {
    const light = lightBlock(tokensCss)
    const dark = darkBlock(tokensCss)

    expect(light).toContain(`--color-surface: ${CHART_COLORS.light.paper};`)
    expect(light).toContain(`--color-text: ${CHART_COLORS.light.text};`)
    expect(light).toContain(`--color-border: ${CHART_COLORS.light.grid};`)

    expect(dark).toContain(`--color-surface: ${CHART_COLORS.dark.paper};`)
    expect(dark).toContain(`--color-text: ${CHART_COLORS.dark.text};`)
    expect(dark).toContain(`--color-border: ${CHART_COLORS.dark.grid};`)
  })

  it('exposes exactly the two themes the app supports', () => {
    expect(Object.keys(CHART_COLORS).sort()).toEqual(['dark', 'light'])
  })
})

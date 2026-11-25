/**
 * WCAG 2.1 AA guard for the theme tokens (theming spec 2026-11-25, "Clair minéral" / "Sombre graphite").
 * Parses src/styles/tokens.css and checks every text / UI pair the app uses, in both themes:
 * 4.5:1 for text, 3:1 for UI boundaries, focus indicators and graphical objects (markers, chart marks).
 * A token change that breaks a pair fails here, before any screen is rendered.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

type Rgba = [number, number, number, number]
type Theme = Record<string, string>

const css = readFileSync(resolve(__dirname, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

function block(selector: RegExp): Theme {
  const m = css.match(selector)
  if (!m) throw new Error(`selector not found: ${selector}`)
  const out: Theme = {}
  for (const [, name, value] of m[1].matchAll(/--([\w-]+):\s*([^;]+);/g)) out[name] = value.trim()
  return out
}

const LIGHT = block(/:root,\s*\[data-theme='light'\]\s*\{([^}]*)\}/)
const DARK = { ...LIGHT, ...block(/\[data-theme='dark'\]\s*\{([^}]*)\}/) }

function parse(value: string, theme: Theme, over: Rgba = [255, 255, 255, 1]): Rgba {
  const v = value.trim()
  const ref = v.match(/^var\(--([\w-]+)\)$/)
  if (ref) return parse(theme[ref[1]], theme, over)
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1) as Rgba
  }
  const rgb = v.match(/^rgb\((\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\)$/)
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3], rgb[4] ? +rgb[4] : 1]
  // color-mix(in <space>, <color> N%, transparent): the color at N % opacity (sRGB approximation)
  const mix = v.match(/^color-mix\(in \w+,\s*(.+?)\s+(\d+)%,\s*transparent\)$/)
  if (mix) {
    const [r, g, b] = parse(mix[1], theme, over)
    return [r, g, b, +mix[2] / 100]
  }
  throw new Error(`unsupported color: ${v}`)
}

/** Opaque color of `token` painted over the opaque `under`. */
function flat(theme: Theme, token: string, under?: Rgba): Rgba {
  const [r, g, b, a] = parse(theme[token], theme)
  const base = under ?? [255, 255, 255, 1]
  return [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a), 1]
}

function luminance([r, g, b]: Rgba): number {
  const c = (x: number) => {
    const s = x / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)
}

function ratio(a: Rgba, b: Rgba): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

type Pair = { fg: string; bg: string; min: number; over?: string }

const SURFACES = ['background', 'card', 'popover', 'sidebar']
const TEXT = ['foreground', 'body', 'muted-foreground', 'faint', 'primary-text', 'sidebar-foreground']
const STATUS = ['danger', 'warning', 'success', 'offline', 'info']

const PAIRS: Pair[] = [
  // Text roles on every surface
  ...TEXT.flatMap((fg) => SURFACES.map((bg) => ({ fg, bg, min: 4.5 }))),
  // Each *-foreground on its own fill
  { fg: 'card-foreground', bg: 'card', min: 4.5 },
  { fg: 'popover-foreground', bg: 'popover', min: 4.5 },
  { fg: 'secondary-foreground', bg: 'secondary', min: 4.5 },
  { fg: 'accent-foreground', bg: 'accent', min: 4.5 },
  { fg: 'primary-foreground', bg: 'primary', min: 4.5 },
  { fg: 'on-signal', bg: 'signal', min: 4.5 },
  { fg: 'sidebar-accent-foreground', bg: 'sidebar-accent', min: 4.5 },
  { fg: 'sidebar-primary-foreground', bg: 'sidebar-primary', min: 4.5 },
  // Status text on the page, the subtle surface and its own tint (pills); text on a filled status
  ...STATUS.flatMap((s) => [
    { fg: s, bg: 'background', min: 4.5 },
    { fg: s, bg: 'card', min: 4.5 },
    { fg: s, bg: `${s}-soft`, over: 'background', min: 4.5 },
    { fg: 'status-foreground', bg: s, min: 4.5 },
  ]),
  // UI boundaries, focus, selection, graphical objects: 3:1
  ...['input', 'ring', 'signal'].flatMap((fg) => SURFACES.map((bg) => ({ fg, bg, min: 3 }))),
  { fg: 'ring-media', bg: 'media', min: 3 },
  { fg: 'signal', bg: 'map-land', min: 3 },
  { fg: 'danger-mark', bg: 'card', min: 3 },
  { fg: 'danger-mark', bg: 'background', min: 3 },
  ...['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'].flatMap((fg) =>
    ['background', 'card'].map((bg) => ({ fg, bg, min: 3 })),
  ),
  { fg: 'chart-axis', bg: 'background', min: 4.5 },
  { fg: 'chart-axis', bg: 'card', min: 4.5 },
]

describe.each([
  ['light', LIGHT],
  ['dark', DARK],
] as const)('tokens.css contrast, %s theme (WCAG 2.1 AA)', (_name, theme) => {
  it.each(PAIRS.map((p) => [`${p.fg} on ${p.bg}${p.over ? ` over ${p.over}` : ''} ≥ ${p.min}`, p] as const))(
    '%s',
    (_label, { fg, bg, min, over }) => {
      const base = over ? flat(theme, over) : undefined
      const back = flat(theme, bg, base)
      const fore = flat(theme, fg, back)
      expect(ratio(fore, back)).toBeGreaterThanOrEqual(min)
    },
  )

  it('defines a value for every token the pairs use', () => {
    for (const p of PAIRS) for (const t of [p.fg, p.bg, p.over].filter(Boolean) as string[]) expect(theme[t], t).toBeTruthy()
  })
})

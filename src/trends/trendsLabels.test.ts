import { describe, expect, it } from 'vitest'
import { labelWidth, placeLabels, type LabelInput } from './trendsLabels'

const bounds = { x0: 0, y0: -20, x1: 600, y1: 300 }
const p = (id: string, cx: number, cy: number, required = true): LabelInput => ({ id, text: id, cx, cy, r: 8, required })

function boxOf(pt: LabelInput, dx: number, dy: number) {
  const w = labelWidth(pt.text)
  return { x0: pt.cx + dx - w / 2, x1: pt.cx + dx + w / 2, y0: pt.cy + dy - 7, y1: pt.cy + dy + 7 }
}

describe('placeLabels (KAN-256)', () => {
  it('puts a lone label above its point', () => {
    const out = placeLabels([p('2026001', 300, 150)], bounds)
    expect(out.get('2026001')).toEqual({ dx: 0, dy: -18 })
  })

  it('moves a label off a neighbour so no two labels overlap', () => {
    const pts = [p('2026001', 300, 150), p('2026003', 310, 152)]
    const out = placeLabels(pts, bounds)
    expect(out.size).toBe(2)
    const [a, b] = pts.map((pt) => boxOf(pt, out.get(pt.id)!.dx, out.get(pt.id)!.dy))
    expect(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1).toBe(false)
  })

  it('drops an optional label that has no free spot, keeps required ones', () => {
    const crowd = Array.from({ length: 9 }, (_, i) => p(`R${i}`, 300 + (i % 3) * 14, 150 + Math.floor(i / 3) * 14))
    const out = placeLabels([...crowd, p('opt', 314, 164, false)], bounds)
    expect(crowd.every((c) => out.has(c.id))).toBe(true)
    expect(out.has('opt')).toBe(false)
  })
})

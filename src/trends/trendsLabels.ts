export interface LabelInput {
  id: string
  text: string
  /** Point centre in plot-area pixels (y down). */
  cx: number
  cy: number
  /** Marker radius in px. */
  r: number
  /** Élevé/Moyen: always labelled; others only where they fit. */
  required: boolean
}

/** Offset of the label centre from the point centre, in px (y down). */
export interface LabelPlacement {
  dx: number
  dy: number
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

const CHAR_PX = 7
const LINE_PX = 14
const GAP = 3

export const labelWidth = (text: string) => text.length * CHAR_PX + 4

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

function candidates(p: LabelInput, w: number): LabelPlacement[] {
  const v = p.r + GAP + LINE_PX / 2
  const h = p.r + GAP + w / 2
  const d = p.r * 0.7 + GAP
  return [
    { dx: 0, dy: -v },
    { dx: 0, dy: v },
    { dx: h, dy: 0 },
    { dx: -h, dy: 0 },
    { dx: d + w / 2, dy: -(d + LINE_PX / 2) },
    { dx: -(d + w / 2), dy: -(d + LINE_PX / 2) },
    { dx: d + w / 2, dy: d + LINE_PX / 2 },
    { dx: -(d + w / 2), dy: d + LINE_PX / 2 },
    { dx: 0, dy: -(v + LINE_PX) },
    { dx: 0, dy: v + LINE_PX },
  ]
}

/**
 * Greedy label placement: required labels first, each takes the first candidate position that stays inside
 * `bounds` and hits no marker or earlier label. A required label with no free spot takes the least-overlapping
 * one; an optional label with no free spot is dropped (its point keeps the hover tooltip).
 */
export function placeLabels(points: LabelInput[], bounds: Box, obstacles: Box[] = []): Map<string, LabelPlacement> {
  const markers = points.map((p) => ({ id: p.id, box: { x0: p.cx - p.r, y0: p.cy - p.r, x1: p.cx + p.r, y1: p.cy + p.r } }))
  const placed: Box[] = [...obstacles]
  const out = new Map<string, LabelPlacement>()
  const order = [...points].sort((a, b) => Number(b.required) - Number(a.required))

  for (const p of order) {
    const w = labelWidth(p.text)
    let best: { c: LabelPlacement; box: Box; hits: number } | null = null
    for (const c of candidates(p, w)) {
      const box = { x0: p.cx + c.dx - w / 2, y0: p.cy + c.dy - LINE_PX / 2, x1: p.cx + c.dx + w / 2, y1: p.cy + c.dy + LINE_PX / 2 }
      if (box.x0 < bounds.x0 || box.x1 > bounds.x1 || box.y0 < bounds.y0 || box.y1 > bounds.y1) continue
      const hits =
        placed.filter((b) => overlaps(b, box)).length + markers.filter((m) => m.id !== p.id && overlaps(m.box, box)).length
      if (!best || hits < best.hits) best = { c, box, hits }
      if (hits === 0) break
    }
    if (best && (best.hits === 0 || p.required)) {
      out.set(p.id, best.c)
      placed.push(best.box)
    }
  }
  return out
}

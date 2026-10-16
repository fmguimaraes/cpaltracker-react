/**
 * KAN-176 (FR26) — JS-side mirror of the theme tokens Plotly's charts need,
 * for the same reason `breakpoints.ts` (KAN-167) mirrors the `@theme`
 * breakpoints instead of reading them off the DOM: Plotly draws its
 * background/gridlines/text as SVG presentation attributes (`fill`, not a
 * CSS `style` property), and SVG presentation attributes do not resolve
 * `var(--token)` — only real CSS properties set through the cascade do. A
 * `paper_bgcolor: 'var(--color-surface)'` layout value is therefore silently
 * ignored by Plotly; it always falls back to its own default (white paper,
 * black text), which is exactly why the three History charts stayed a
 * bright-white box in dark mode until this story (the review-flagged FR26
 * "map/chart dark-mode" gap) — a real, observable rendering defect, not a
 * theoretical one.
 *
 * Keep these values identical to `tokens.css`'s `:root`/`:root[data-theme=
 * 'dark']` `--color-surface`/`--color-text`/`--color-border` — there is no
 * automated bridge between the two files (same caveat `breakpoints.ts`
 * documents), so a token change on one side without the other silently
 * reintroduces the mismatch this file exists to prevent.
 */
export interface ChartThemeColors {
  paper: string
  plot: string
  text: string
  grid: string
}

export const CHART_COLORS: Record<'light' | 'dark', ChartThemeColors> = {
  light: {
    paper: '#f4f5f7',
    plot: '#f4f5f7',
    text: '#1a1d21',
    grid: '#d8dce1',
  },
  dark: {
    paper: '#1d2126',
    plot: '#1d2126',
    text: '#e7e9ec',
    grid: '#343a42',
  },
}

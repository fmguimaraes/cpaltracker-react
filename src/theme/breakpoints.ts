/**
 * KAN-167 (FR7) — JS-side mirror of the single reconciled breakpoint token
 * set defined in `tokens.css`'s `@theme` block.
 *
 * Why this file exists at all: Tailwind's `@theme` breakpoint variables are
 * resolved at build time into generated utility CSS (and exposed as runtime
 * CSS custom properties), but neither form is readable by `window.matchMedia`
 * without a synchronous DOM round trip. Any future JS-side responsive logic
 * (a `useMediaQuery` hook, a resize listener, server-rendered layout logic,
 * etc.) needs a plain numeric value instead — this is that single source for
 * the JS side, mirroring the CSS tokens rather than re-deriving them.
 *
 * `sm` (480px) replicates cpaltracker.web's `auth.css` mobile cutoff;
 * `md` (768px) replicates `styles.css`'s sidebar/logo/title cutoff (CB22).
 * Keep these two values identical to `--breakpoint-sm`/`--breakpoint-md` in
 * `tokens.css` — there is no automated bridge between the two files, so a
 * change to one without the other silently reintroduces a two-convention
 * split.
 */
export const BREAKPOINTS = {
  sm: 480,
  md: 768,
} as const

export type BreakpointName = keyof typeof BREAKPOINTS

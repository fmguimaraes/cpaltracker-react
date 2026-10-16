import type { ReactNode } from 'react'

interface PageTitleProps {
  children: ReactNode
  'data-testid'?: string
}

/**
 * KAN-171 (FR9, FR10) — the shared page-title heading every route renders
 * instead of its own ad-hoc `<h1>`.
 *
 * FR9: replicates `styles.css`'s `.cpal-titre` (CB18) — `color:
 * var(--primary)` and a responsive font size — without a per-class literal:
 * the color comes from the `--color-primary` token (FR5) and the size from
 * the typography-scale tokens `tokens.css` already defines (`--font-size-xl`/
 * `--font-size-lg`, FR10), consumed here via Tailwind's arbitrary-value
 * syntax (`text-[length:var(--font-size-xl)]`) rather than Tailwind's own
 * built-in `text-xl` scale, which every route previously used instead of
 * this token set (the ad-hoc-`font-size` gap FR10/CB24 names).
 *
 * The `max-md:` shrink (reconciled 768px breakpoint, FR7) mirrors CB18's own
 * `1.7rem` → `1.3rem` shrink at its legacy `768px` cutoff.
 */
export function PageTitle({ children, 'data-testid': testId }: PageTitleProps) {
  return (
    <h1
      data-testid={testId}
      className="m-0 font-semibold text-[length:var(--font-size-xl)] max-md:text-[length:var(--font-size-lg)]"
      style={{ color: 'var(--color-primary)' }}
    >
      {children}
    </h1>
  )
}

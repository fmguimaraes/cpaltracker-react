/**
 * KAN-171 (FR8) — the c-PAL brand logo rendered in the app chrome's
 * sidebar, replicating `styles.css`'s `.cpal-logo-sidebar`/`.cpal-logo-icone`
 * (CB17): a fixed base height (48px) that shrinks to 40px at the reconciled
 * `max-md` breakpoint (768px, FR7) — `h-12`/`max-md:h-10` are exactly those
 * two values in Tailwind's default rem scale (`3rem`/`2.5rem`), driven by
 * `tokens.css`'s `@theme` breakpoint tokens rather than a literal `@media`
 * rule.
 *
 * Reuses the actual legacy brand asset (`cpaltracker.web/logo-cpal.png`,
 * copied verbatim into `public/logo-cpal.png`) rather than a newly invented
 * mark — this is the one c-PAL brand logo, not the per-client logo
 * `ClientLogo` renders (that one comes from `/api/v1`, this one ships with
 * the app).
 */
export function CpalBrandMark() {
  return (
    <img
      src="/logo-cpal.png"
      alt="c-PAL"
      data-testid="cpal-brand-mark"
      className="h-12 w-auto max-md:h-10"
    />
  )
}

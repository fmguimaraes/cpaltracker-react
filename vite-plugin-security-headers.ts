import type { Plugin, ResolvedConfig } from 'vite'

/**
 * KAN-177 — CSP & security-header hardening.
 *
 * This repo has no serving layer of its own yet (no nginx/CDN config lives
 * here) — `npm run build` only produces static files for whoever hosts
 * them. True HTTP response headers (`X-Frame-Options`,
 * `X-Content-Type-Options`, `Strict-Transport-Security`, and CSP's
 * `frame-ancestors`/`sandbox`/reporting directives, none of which a `<meta>`
 * element can express per spec) are that hosting layer's job once one
 * exists — tracked as a follow-up, not implemented here. What a built
 * `index.html` can carry on its own is a CSP `<meta http-equiv>` tag and a
 * `referrer` meta tag, injected here at build time only (`apply: 'build'`):
 * the Vite dev server's HMR client needs eval/inline-script leeway this
 * plugin would otherwise block, and dev is never the XSS-exposed surface
 * this story is hardening against.
 *
 * Primary target (stack-decision.md §6): the bearer auth token lives in an
 * in-memory JS variable, readable by any script that runs in-page, so the
 * main lever here is `script-src 'self'` with no `unsafe-inline`/
 * `unsafe-eval` — a built Vite app has no inline `<script>` tags and no
 * `eval`, so this costs nothing functionally and closes the main script-
 * injection path. `style-src` keeps `'unsafe-inline'` because this
 * codebase's components set `style={{ ... }}` extensively (inline style
 * *attributes*, not `<script>`), which CSP's `unsafe-inline` for styles
 * governs; that is a far lower-severity relaxation (no code execution) and
 * standard practice for apps using inline style attributes.
 *
 * Review gate round 1 (B1): an earlier version read `process.env.VITE_API_BASE_URL`
 * directly. That diverges from what `client.ts`'s `resolveBaseUrl()` actually
 * sees via `import.meta.env` whenever the value comes from a `.env` file
 * rather than an inline shell variable — Vite's `loadEnv()` parses `.env*`
 * files into its own resolved config and does NOT write them back into
 * `process.env`. Under that divergence the plugin would silently fall back
 * to `connect-src 'self'` (no API origin) while the app itself still had a
 * working API base URL — CSP would then block every real `/api/v1` call at
 * runtime, with no build error. Fixed by reading `ResolvedConfig.env`
 * (captured via the `configResolved` hook), the exact same resolved value
 * Vite injects into `import.meta.env` for client code, regardless of
 * whether it came from the shell or a `.env` file.
 */
export function securityHeadersPlugin(): Plugin {
  let resolvedEnv: ResolvedConfig['env'] | undefined

  return {
    name: 'cpaltracker-security-headers',
    apply: 'build',
    configResolved(config) {
      resolvedEnv = config.env
    },
    transformIndexHtml() {
      const apiBaseUrl = resolvedEnv?.VITE_API_BASE_URL as string | undefined
      const connectSrc = ["'self'"]
      if (apiBaseUrl) {
        try {
          connectSrc.push(new URL(apiBaseUrl).origin)
        } catch {
          // Malformed VITE_API_BASE_URL is already a hard failure at
          // runtime (client.ts's resolveBaseUrl throws) — the build itself
          // shouldn't also fail on it, so connect-src just falls back to
          // 'self' and the real error surfaces where it already does.
        }
      }

      const csp = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://tile.openstreetmap.org",
        `connect-src ${connectSrc.join(' ')}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')

      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: csp },
          injectTo: 'head-prepend',
        },
        {
          tag: 'meta',
          attrs: { name: 'referrer', content: 'strict-origin-when-cross-origin' },
          injectTo: 'head-prepend',
        },
      ]
    },
  }
}

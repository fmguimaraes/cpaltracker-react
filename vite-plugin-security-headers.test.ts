import type { ResolvedConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import { securityHeadersPlugin } from './vite-plugin-security-headers'

interface Descriptor {
  tag: string
  attrs: Record<string, string>
}

// Mirrors how Vite actually drives a plugin: `configResolved` is called once
// with the fully resolved config (the same `config.env` that populates
// `import.meta.env` for client code), then `transformIndexHtml` runs during
// the build. Going through `configResolved` here — rather than poking
// `process.env` — is what would have caught review round 1's B1 finding:
// a `.env`-file-sourced var never reaches `process.env`, only `config.env`.
function runTransform(env: Partial<ResolvedConfig['env']>): Descriptor[] {
  const plugin = securityHeadersPlugin()

  const configResolvedHook = plugin.configResolved
  const configResolvedFn = typeof configResolvedHook === 'function' ? configResolvedHook : configResolvedHook!.handler
  configResolvedFn.call({} as never, { env } as ResolvedConfig)

  const transformHook = plugin.transformIndexHtml
  const transformFn = typeof transformHook === 'function' ? transformHook : transformHook!.handler
  return transformFn.call({} as never, '<html></html>', {} as never) as Descriptor[]
}

function metaContent(descriptors: Descriptor[], httpEquivOrName: string): string | undefined {
  const match = descriptors.find(
    (d) =>
      d.attrs['http-equiv'] === httpEquivOrName || d.attrs.name === httpEquivOrName,
  )
  return match?.attrs.content
}

describe('securityHeadersPlugin (KAN-177)', () => {
  it('only applies at build time, never to the dev server', () => {
    expect(securityHeadersPlugin().apply).toBe('build')
  })

  it('emits a restrictive CSP with no unsafe-inline/unsafe-eval for scripts', () => {
    const csp = metaContent(
      runTransform({ VITE_API_BASE_URL: 'https://api.example.test/api/v1' }),
      'Content-Security-Policy',
    )

    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  it("adds the API's own origin to connect-src, derived from VITE_API_BASE_URL", () => {
    const csp = metaContent(
      runTransform({ VITE_API_BASE_URL: 'https://staging.cpal.example:8443/api/v1' }),
      'Content-Security-Policy',
    )

    expect(csp).toContain("connect-src 'self' https://staging.cpal.example:8443")
  })

  it('falls back to connect-src self only when VITE_API_BASE_URL is unset or malformed', () => {
    const csp = metaContent(runTransform({}), 'Content-Security-Policy')

    expect(csp).toContain("connect-src 'self'")
    expect(csp).not.toContain('connect-src \'self\' http')
  })

  it('sets a non-leaking referrer policy', () => {
    const referrer = metaContent(runTransform({}), 'referrer')

    expect(referrer).toBe('strict-origin-when-cross-origin')
  })

  it('allows blob: images, since ClientLogo (KAN-165) renders a fetched logo via a blob: object URL', () => {
    const csp = metaContent(runTransform({}), 'Content-Security-Policy')

    expect(csp).toContain('img-src')
    expect(csp).toMatch(/img-src[^;]*blob:/)
  })

  it(
    'reads VITE_API_BASE_URL from the resolved Vite config, not process.env (review round 1, B1): ' +
      'a value supplied only via a .env file never reaches process.env, but must still reach connect-src',
    () => {
      const originalProcessEnv = process.env.VITE_API_BASE_URL
      delete process.env.VITE_API_BASE_URL

      try {
        const csp = metaContent(
          runTransform({ VITE_API_BASE_URL: 'https://dotenv-only.example.test' }),
          'Content-Security-Policy',
        )

        expect(csp).toContain("connect-src 'self' https://dotenv-only.example.test")
      } finally {
        process.env.VITE_API_BASE_URL = originalProcessEnv
      }
    },
  )

  it('allows exactly the OpenStreetMap tile host for img-src, nothing wider (KAN-222)', () => {
    const csp = metaContent(runTransform({}), 'Content-Security-Policy')
    const imgSrc = csp?.split('; ').find((d) => d.startsWith('img-src'))

    expect(imgSrc).toBe("img-src 'self' data: blob: https://tile.openstreetmap.org")
    expect(imgSrc).not.toContain('*')
  })
})

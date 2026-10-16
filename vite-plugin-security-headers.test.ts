import { afterEach, describe, expect, it } from 'vitest'
import { securityHeadersPlugin } from './vite-plugin-security-headers'

interface Descriptor {
  tag: string
  attrs: Record<string, string>
}

function runTransform(): Descriptor[] {
  const plugin = securityHeadersPlugin()
  const hook = plugin.transformIndexHtml
  const fn = typeof hook === 'function' ? hook : hook!.handler
  return fn.call({} as never, '<html></html>', {} as never) as Descriptor[]
}

function metaContent(descriptors: Descriptor[], httpEquivOrName: string): string | undefined {
  const match = descriptors.find(
    (d) =>
      d.attrs['http-equiv'] === httpEquivOrName || d.attrs.name === httpEquivOrName,
  )
  return match?.attrs.content
}

describe('securityHeadersPlugin (KAN-177)', () => {
  const originalEnv = process.env.VITE_API_BASE_URL

  afterEach(() => {
    process.env.VITE_API_BASE_URL = originalEnv
  })

  it('only applies at build time, never to the dev server', () => {
    expect(securityHeadersPlugin().apply).toBe('build')
  })

  it('emits a restrictive CSP with no unsafe-inline/unsafe-eval for scripts', () => {
    process.env.VITE_API_BASE_URL = 'https://api.example.test/api/v1'

    const csp = metaContent(runTransform(), 'Content-Security-Policy')

    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toContain('unsafe-eval')
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/)
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
  })

  it("adds the API's own origin to connect-src, derived from VITE_API_BASE_URL", () => {
    process.env.VITE_API_BASE_URL = 'https://staging.cpal.example:8443/api/v1'

    const csp = metaContent(runTransform(), 'Content-Security-Policy')

    expect(csp).toContain("connect-src 'self' https://staging.cpal.example:8443")
  })

  it('falls back to connect-src self only when VITE_API_BASE_URL is unset or malformed', () => {
    delete process.env.VITE_API_BASE_URL

    const csp = metaContent(runTransform(), 'Content-Security-Policy')

    expect(csp).toContain("connect-src 'self'")
    expect(csp).not.toContain('connect-src \'self\' http')
  })

  it('sets a non-leaking referrer policy', () => {
    const referrer = metaContent(runTransform(), 'referrer')

    expect(referrer).toBe('strict-origin-when-cross-origin')
  })

  it('allows blob: images, since ClientLogo (KAN-165) renders a fetched logo via a blob: object URL', () => {
    const csp = metaContent(runTransform(), 'Content-Security-Policy')

    expect(csp).toContain('img-src')
    expect(csp).toMatch(/img-src[^;]*blob:/)
  })
})

import { test, expect } from '@playwright/test'

/**
 * KAN-223 (epic KAN-217) - F-17 / K-3: the stored theme is applied before first paint, in the
 * production build, under its CSP (`script-src 'self'`, no inline script, no hash).
 * The pre-paint script is the same-origin classic script `/theme-init.js` (public/), loaded from
 * the <head> of index.html. The suite runs against `vite build` + `vite preview`, so the CSP meta
 * tag of the security-headers plugin is in force here.
 */

const account = {
  userId: 1,
  clientId: null,
  mail: 'demo@cpal.test',
  nom: 'Demo',
  prenom: 'User',
  role: 'client',
  telephone: null,
  lastLoginAt: null,
  mustChangePassword: false,
}

test.describe('KAN-223 theme before first paint', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/account.php', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
    )
    await page.route('**/contracts/list.php', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
    )
  })

  test('AC1 @SI-223-1 a stored light theme is on <html> before React mounts, with no CSP violation', async ({
    page,
  }) => {
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })
    const themeInit: number[] = []
    page.on('response', (response) => {
      if (new URL(response.url()).pathname === '/theme-init.js') themeInit.push(response.status())
    })

    // Runs before any page script: store "light", and record the theme at the first moments the
    // page could paint (the <body> parsed) and when React first renders into #root.
    await page.addInitScript(() => {
      localStorage.setItem('cpaltracker:theme', 'light')
      const probe = { atBody: null as string | null, atReactMount: null as string | null, violations: [] as string[] }
      ;(window as unknown as { __themeProbe: typeof probe }).__themeProbe = probe
      document.addEventListener('securitypolicyviolation', (e) => {
        probe.violations.push(`${e.violatedDirective} ${e.blockedURI}`)
      })
      const observer = new MutationObserver(() => {
        const html = document.documentElement
        if (probe.atBody === null && document.body) probe.atBody = html.getAttribute('data-theme')
        const root = document.getElementById('root')
        if (probe.atReactMount === null && root && root.childNodes.length > 0) {
          probe.atReactMount = html.getAttribute('data-theme')
          observer.disconnect()
        }
      })
      observer.observe(document, { childList: true, subtree: true })
    })

    await page.goto('/live-tracking')
    await expect(page.getByTestId('app-sidebar')).toBeVisible()

    const probe = await page.evaluate(
      () => (window as unknown as { __themeProbe: { atBody: string | null; atReactMount: string | null; violations: string[] } }).__themeProbe,
    )
    // index.html ships data-theme="dark": "light" here can only come from /theme-init.js.
    expect(probe.atBody).toBe('light')
    expect(probe.atReactMount).toBe('light')
    expect(probe.violations).toEqual([])
    expect(themeInit).toEqual([200])
    expect(consoleErrors.filter((t) => /Refused to execute/i.test(t))).toEqual([])
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    // The CSP of the build stays strict: no inline script allowance, no hash.
    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    const scriptSrc = (csp ?? '').split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'))
    expect(scriptSrc).toBe("script-src 'self'")
    // No inline <script> left in the document.
    expect(await page.locator('script:not([src])').count()).toBe(0)
  })

  test('AC2 @SI-223-2 without a stored choice the default dark theme is applied before React mounts', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const probe = { atReactMount: null as string | null }
      ;(window as unknown as { __themeProbe: typeof probe }).__themeProbe = probe
      const observer = new MutationObserver(() => {
        const root = document.getElementById('root')
        if (probe.atReactMount === null && root && root.childNodes.length > 0) {
          probe.atReactMount = document.documentElement.getAttribute('data-theme')
          observer.disconnect()
        }
      })
      observer.observe(document, { childList: true, subtree: true })
    })
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/live-tracking')
    await expect(page.getByTestId('app-sidebar')).toBeVisible()
    const atReactMount = await page.evaluate(
      () => (window as unknown as { __themeProbe: { atReactMount: string | null } }).__themeProbe.atReactMount,
    )
    expect(atReactMount).toBe('dark')
  })
})

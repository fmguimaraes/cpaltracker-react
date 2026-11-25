import { test, expect } from '@playwright/test'
import { openContractSelect, pickContract } from './contract-helpers'

/**
 * KAN-158 smoke coverage for Live Tracking's entry gate and contract
 * selector (FR1/FR2). The map/refresh/filter/messaging behaviour is later
 * stories' job (KAN-160/162/165/168) — this file only covers the gate and
 * the selector's admin-vs-non-admin disclosure.
 *
 * KAN-168 adds one composed "primary flow" test spanning the whole feature
 * end to end (its own AC literally asks for this, distinct from the
 * per-feature tests above which exercise one FR group at a time), plus the
 * unauthorized/malformed-contract state (FR15).
 */

// The positions fixtures below date from 2026-10-10; Live Tracking now filters by last report over a
// 30-day default period, so pin the browser clock to keep them inside it.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-12T09:00:00Z'))
})

const account = {
  userId: 1,
  clientId: 7,
  mail: 'demo@cpal.test',
  nom: 'Demo',
  prenom: 'User',
  role: 'client',
  telephone: null,
  lastLoginAt: null,
  mustChangePassword: false,
}

test('redirects an unauthenticated visit to /login, preserving the return path (FR1)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )

  await page.goto('/live-tracking')

  await expect(page).toHaveURL(/\/login\?suite=%2Flive-tracking$/)
})

test('a non-admin with a single contract sees no selector; it loads automatically (FR2)', async ({ page }) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
      }),
    }),
  )
  const positionsRequest = page.waitForRequest((request) => request.url().includes('/devices/positions.php'))
  await page.route('**/devices/positions.php**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ positions: [] }) }),
  )

  await page.goto('/live-tracking')

  await expect(page.getByTestId('contract-selector')).toHaveCount(0)
  await expect(page.getByTestId('contract-selector-collapsed')).toHaveCount(0)
  expect((await positionsRequest).url()).toContain('contractId=12')
})

test('an admin sees every contract with its client name (FR2)', async ({ page }) => {
  // Map pages open with the icon rail by default; the full contract Select needs the expanded nav.
  await page.addInitScript(() => window.localStorage.setItem('cpal.shell.nav', 'expanded'))
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ account: { ...account, role: 'admin', clientId: null } }),
    }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [
          { contractId: 12, contractRef: 'REF-012', contractType: 'STD', clientId: 7, clientName: 'Acme Corp' },
          { contractId: 34, contractRef: 'REF-034', contractType: 'MAIN', clientId: 9, clientName: 'Other Client' },
        ],
      }),
    }),
  )

  await page.goto('/live-tracking')

  await openContractSelect(page)
  await expect(page.getByTestId('contract-option-12')).toHaveText('REF-012 (Acme Corp)')
  await expect(page.getByTestId('contract-option-34')).toHaveText('REF-034 (Other Client)')
})

test('a user with zero visible contracts gets an explicit empty state, no selector (FR15)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )

  await page.goto('/live-tracking')

  await expect(page.getByTestId('live-tracking-empty')).toBeVisible()
})

test('selecting a contract renders one marker per positioned device with an accessible tooltip (FR3, FR4, FR7)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
      }),
    }),
  )
  await page.route('**/devices/positions.php**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        positions: [
          {
            contractId: 12,
            chipId: 'CHIP-001',
            timestamp: '2026-10-10T08:00:05Z',
            latitude: 48.8566,
            longitude: 2.3522,
            ambientTemperature: 19.1,
            humidity: 55,
            mass: 420,
            mpuTemperature: 21.5,
            accelG: 1.02,
          },
          {
            contractId: 12,
            chipId: 'CHIP-002',
            timestamp: null,
            latitude: null,
            longitude: null,
            ambientTemperature: null,
            humidity: null,
            mass: null,
            mpuTemperature: null,
            accelG: null,
          },
        ],
      }),
    }),
  )

  await page.goto('/live-tracking')

  const markers = page.locator('.leaflet-marker-icon')
  await expect(markers).toHaveCount(1)

  await markers.first().focus()
  // The card shows local time (fr-FR, browser zone): the day, a relative age, the 4-decimal place and the weight.
  const tooltip = page.locator('.leaflet-tooltip')
  await expect(tooltip.getByTestId('marker-tooltip-title')).toHaveText('CHIP-001')
  await expect(tooltip.getByTestId('marker-tooltip-when')).toContainText(/10\soct\.\s[\s\S]*il\sy\sa\s2\sj/)
  await expect(tooltip.getByTestId('marker-tooltip-place')).toHaveText('48,8566, 2,3522')
  await expect(tooltip.getByTestId('marker-tooltip-weight')).toContainText(/420\s*kg/)
})

test('manual refresh keeps the prior snapshot on failure, and the device filter hides markers without a new request (FR8, FR9, FR10)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
      }),
    }),
  )

  let positionsRequestCount = 0
  await page.route('**/devices/positions.php**', (route) => {
    positionsRequestCount += 1
    if (positionsRequestCount === 2) {
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'service_unavailable', message: 'DB is down' } }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        positions: [
          {
            contractId: 12,
            chipId: 'CHIP-001',
            timestamp: '2026-10-10T08:00:05Z',
            latitude: 48.8566,
            longitude: 2.3522,
            ambientTemperature: 19.1,
            humidity: 55,
            mass: 420,
            mpuTemperature: 21.5,
            accelG: 1.02,
          },
          {
            contractId: 12,
            chipId: 'CHIP-002',
            timestamp: '2026-10-10T08:00:05Z',
            latitude: 45.75,
            longitude: 4.85,
            ambientTemperature: 19.1,
            humidity: 55,
            mass: 300,
            mpuTemperature: 21.5,
            accelG: 1.02,
          },
        ],
      }),
    })
  })

  await page.goto('/live-tracking')

  const markers = page.locator('.leaflet-marker-icon')
  await expect(markers).toHaveCount(2)
  await expect(page.getByTestId('positions-last-updated')).toBeVisible()

  await page.getByTestId('device-filter-CHIP-002').uncheck()
  await expect(markers).toHaveCount(1)
  expect(positionsRequestCount).toBe(1)

  await page.getByTestId('positions-refresh').click()
  await expect(page.getByTestId('positions-refresh-error')).toBeVisible()
  await expect(markers).toHaveCount(1)

  await page.getByTestId('positions-refresh').click()
  await expect(page.getByTestId('positions-refresh-error')).not.toBeVisible()
})

test('shows the per-contract message as plain text and the logo when flagged, with no global message and no History handoff link (FR12, FR13; FR11/FR14 withdrawn)', async ({
  page,
}) => {
  // The client logo lives in the sidebar header, hidden in the icon rail.
  await page.addInitScript(() => window.localStorage.setItem('cpal.shell.nav', 'expanded'))
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
      }),
    }),
  )
  await page.route('**/devices/positions.php**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ positions: [] }) }),
  )
  await page.route('**/messages/contract.php**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: { date: null, contenu: 'Message du contrat 12.' } }),
    }),
  )
  // KAN-161: the single unified-404 endpoint, scoped to the account's own
  // clientId (7 — see `account` above), replaces KAN-165's
  // logo-flag.php + logo.php two-call model.
  await page.route('**/clients/logo.php/7', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      // A 1x1 transparent PNG — just needs to be valid image bytes.
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  )

  await page.goto('/live-tracking')

  // FR11 (global message) is withdrawn by operator decision 2026-10-29: no announcement box on the page.
  await expect(page.getByTestId('global-message')).toHaveCount(0)

  // FR1 (KAN-161): logo shown once the unified endpoint serves the image.
  await expect(page.getByTestId('client-logo')).toBeVisible()

  // A single-contract non-admin sees no selector; it's pre-selected on load (operator decision 2026-10-29).
  await expect(page.getByTestId('contract-selector')).toHaveCount(0)

  // FR12: per-contract message shown once selected.
  await expect(page.getByTestId('contract-message')).toContainText('Message du contrat 12.')

  // FR14 (History handoff link) is withdrawn by operator decision 2026-10-29.
  await expect(page.getByTestId('history-dashboard-link')).toHaveCount(0)
})

test('primary flow: login-gated access, select a contract, markers render, refresh updates "last updated" (KAN-168)', async ({
  page,
}) => {
  // FR1: anonymous visit redirects to /login rather than rendering anything.
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )
  await page.goto('/live-tracking')
  await expect(page).toHaveURL(/\/login\?suite=%2Flive-tracking$/)

  // Now authenticated — the same page is reachable and the full flow works.
  await page.unroute('**/account.php')
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }],
      }),
    }),
  )
  await page.route('**/messages/contract.php**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: null }) }),
  )
  // KAN-161: no logo for this account — the unified 404 (same body as an
  // out-of-scope clientId, by design) renders the neutral placeholder;
  // this flow doesn't assert on it either way.
  await page.route('**/clients/logo.php/7', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'No logo found for this client.' } }),
    }),
  )

  let positionsRequestCount = 0
  await page.route('**/devices/positions.php**', (route) => {
    positionsRequestCount += 1
    const mass = positionsRequestCount === 1 ? 420 : 430
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        positions: [
          {
            contractId: 12,
            chipId: 'CHIP-001',
            timestamp: '2026-10-10T08:00:05Z',
            latitude: 48.8566,
            longitude: 2.3522,
            ambientTemperature: 19.1,
            humidity: 55,
            mass,
            mpuTemperature: 21.5,
            accelG: 1.02,
          },
        ],
      }),
    })
  })

  await page.goto('/live-tracking')

  const markers = page.locator('.leaflet-marker-icon')
  await expect(markers).toHaveCount(1)

  // The exact "last updated" timestamp string is unit-tested elsewhere
  // (KAN-162) with a controllable clock; the second-granularity format here
  // can't be asserted to *change* without a flaky race against real time,
  // so this flow checks what a real user would: the refresh completes
  // without error and genuinely re-fetches (not a no-op).
  const lastUpdated = page.getByTestId('positions-last-updated')
  await expect(lastUpdated).toBeVisible()

  await page.getByTestId('positions-refresh').click()
  await expect(markers).toHaveCount(1)
  await expect(page.getByTestId('positions-refresh-error')).toHaveCount(0)
  expect(positionsRequestCount).toBe(2)
})

test('clears the selection and shows a generic message on an unauthorized/nonexistent contract (KAN-168 FR15)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        contracts: [{ contractId: 99, contractRef: 'REF-099', contractType: 'STD' }],
      }),
    }),
  )
  await page.route('**/devices/positions.php**', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'Not found' } }),
    }),
  )

  await page.goto('/live-tracking')

  await expect(page.getByTestId('contract-access-error')).toBeVisible()
  // A single, rejected contract leaves nothing to pick between: the selector stays hidden.
  await expect(page.getByTestId('contract-selector')).toHaveCount(0)
  expect(await page.getByTestId('contract-access-error').textContent()).not.toContain('99')
})

/**
 * KAN-161 (FR1-FR4, NFR6, NFR7) — Logo Rendering & Unified-404 Error
 * Handling. Supersedes KAN-165's own logo coverage above (which only
 * asserted the success path): every non-success logo outcome must render
 * one identical, empty placeholder, and an admin/no-ClientID account must
 * never even request the logo.
 *
 * KAN-164 (NFR2) closes this file's remaining gap against NFR2's explicit
 * list: the 404 and network-failure placeholder cases above were already
 * covered, as was the admin-gated no-request case, but the forbidden (403)
 * placeholder case and the non-admin/no-ClientID gated case were only
 * Vitest-covered (ClientLogo.test.tsx), not E2E-covered. The two tests
 * below close that gap; they are deliberately NOT duplicating the 404 or
 * admin tests above.
 */

test('renders nothing — no placeholder, no error — on the unified 404 (FR3, NFR7)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )
  // The unified 404: the exact same body whether clientId 7 is out of
  // scope or simply has no logo (client_logo_logic.php) — this UI never
  // tries to tell those apart either.
  await page.route('**/clients/logo.php/7', (route) =>
    route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'No logo found for this client.' } }),
    }),
  )

  await page.goto('/live-tracking')
  await expect(page.getByTestId('live-tracking-empty')).toBeVisible()

  await expect(page.getByTestId('client-logo-skeleton')).toHaveCount(0)
  await expect(page.getByTestId('client-logo')).toHaveCount(0)
  await expect(page.getByTestId('client-logo-placeholder')).toHaveCount(0)
})

test('renders nothing on a network/service failure, exactly as on the unified 404 (FR3, NFR7)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )
  await page.route('**/clients/logo.php/7', (route) => route.abort('failed'))

  await page.goto('/live-tracking')
  await expect(page.getByTestId('live-tracking-empty')).toBeVisible()

  await expect(page.getByTestId('client-logo-skeleton')).toHaveCount(0)
  await expect(page.getByTestId('client-logo')).toHaveCount(0)
  await expect(page.getByTestId('client-logo-placeholder')).toHaveCount(0)
})

test('never requests or renders a logo for an admin account (FR2)', async ({ page }) => {
  let logoRequested = false
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ account: { ...account, role: 'admin', clientId: null } }),
    }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )
  await page.route('**/clients/logo.php/**', (route) => {
    logoRequested = true
    return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('fake-png') })
  })

  await page.goto('/live-tracking')
  await expect(page.getByTestId('live-tracking-empty')).toBeVisible()

  await expect(page.getByTestId('client-logo')).toHaveCount(0)
  await expect(page.getByTestId('client-logo-placeholder')).toHaveCount(0)
  expect(logoRequested).toBe(false)
})

test('renders nothing on a forbidden (403) response, exactly as on the unified 404 (FR3, NFR2, NFR7)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )
  // Forbidden must be indistinguishable from the 404 case above (GAP1):
  // nothing rendered either way, so nothing can reveal the failure cause.
  await page.route('**/clients/logo.php/7', (route) =>
    route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'must_change_password', message: 'nope' } }),
    }),
  )

  await page.goto('/live-tracking')
  await expect(page.getByTestId('live-tracking-empty')).toBeVisible()

  await expect(page.getByTestId('client-logo-skeleton')).toHaveCount(0)
  await expect(page.getByTestId('client-logo')).toHaveCount(0)
  await expect(page.getByTestId('client-logo-placeholder')).toHaveCount(0)
})

test('never requests or renders a logo for a non-admin account with no ClientID (FR2, NFR2)', async ({
  page,
}) => {
  let logoRequested = false
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ account: { ...account, clientId: null } }),
    }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )
  await page.route('**/clients/logo.php/**', (route) => {
    logoRequested = true
    return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('fake-png') })
  })

  await page.goto('/live-tracking')
  await expect(page.getByTestId('live-tracking-empty')).toBeVisible()

  await expect(page.getByTestId('client-logo')).toHaveCount(0)
  await expect(page.getByTestId('client-logo-placeholder')).toHaveCount(0)
  expect(logoRequested).toBe(false)
})

test('the header period filters devices by their last report (default 30 days, presets narrow it)', async ({ page }) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }] }),
    }),
  )
  await page.route('**/messages/contract.php**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: null }) }),
  )
  const base = { contractId: 12, latitude: 48.85, longitude: 2.35, ambientTemperature: 19, humidity: 55, mass: 420, mpuTemperature: 21, accelG: 1 }
  await page.route('**/devices/positions.php**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        positions: [
          { ...base, chipId: 'CHIP-NEW', timestamp: '2026-10-12T08:00:00Z' },
          { ...base, chipId: 'CHIP-MID', latitude: 48.9, timestamp: '2026-10-10T08:00:00Z' },
          { ...base, chipId: 'CHIP-OLD', latitude: 49, timestamp: '2026-08-01T08:00:00Z' },
        ],
      }),
    }),
  )

  await page.goto('/live-tracking')

  const markers = page.locator('.leaflet-marker-icon')
  await expect(page.getByTestId('time-30d')).toHaveAttribute('aria-checked', 'true')
  await expect(markers).toHaveCount(2)
  await expect(page.getByTestId('device-filter-CHIP-OLD')).toHaveCount(0)

  // Layout (operator decision 2026-10-29): no gap under the header, and on desktop the map fills the
  // viewport height with no page scrollbar; below md the layout stacks.
  const metrics = () =>
    page.evaluate(() => {
      const header = document.querySelector('[data-testid="shell-toolbar"]')!.getBoundingClientRect()
      const split = document.querySelector('[data-testid="live-split"]')!.getBoundingClientRect()
      const leaflet = document.querySelector('.leaflet-container')!.getBoundingClientRect()
      const doc = document.documentElement
      return {
        gap: Math.round(split.top - header.bottom),
        bottomDelta: Math.round(innerHeight - split.bottom),
        leafletHeight: Math.round(leaflet.height),
        splitHeight: Math.round(split.height),
        scrolls: doc.scrollHeight > doc.clientHeight,
      }
    })
  for (const [width, height] of [
    [1440, 900],
    [1920, 1080],
  ]) {
    await page.setViewportSize({ width, height })
    await expect.poll(async () => (await metrics()).bottomDelta).toBeLessThanOrEqual(8)
    const m = await metrics()
    expect(m.gap).toBe(0)
    expect(m.scrolls).toBe(false)
    expect(Math.abs(m.leafletHeight - m.splitHeight)).toBeLessThanOrEqual(1)
  }
  await page.setViewportSize({ width: 1440, height: 900 })

  // Fleet panel collapse shrinks the card to its header row, and reopening restores it.
  const fleet = page.getByTestId('fleet-panel')
  const openHeight = (await fleet.boundingBox())!.height
  await page.getByRole('button', { name: 'Réduire le panneau de flotte' }).click()
  await expect.poll(async () => (await fleet.boundingBox())!.height).toBeLessThan(80)
  await page.getByRole('button', { name: 'Ouvrir le panneau de flotte' }).click()
  await expect.poll(async () => (await fleet.boundingBox())!.height).toBeGreaterThan(openHeight - 2)

  await page.setViewportSize({ width: 390, height: 844 })
  const mobile = await metrics()
  expect(mobile.gap).toBe(0)
  await page.setViewportSize({ width: 1440, height: 900 })

  await page.getByTestId('time-24h').click()
  await expect(markers).toHaveCount(1)
  await expect(page.getByTestId('device-filter-CHIP-MID')).toHaveCount(0)
  await expect(page.getByTestId('device-filter-CHIP-NEW')).toBeVisible()

  // The shortest preset is now 1 j: advance the browser clock so every device is older than the 7 j window.
  await page.clock.setFixedTime(new Date('2026-10-25T09:00:00Z'))
  await page.getByTestId('time-7d').click()
  await expect(page.getByTestId('positions-period-empty')).toHaveText(
    "Aucun appareil n'a émis de position sur cette période.",
  )
})

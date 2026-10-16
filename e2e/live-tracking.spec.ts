import { test, expect } from '@playwright/test'

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

test('a non-admin sees only their own contracts, with no client name (FR2)', async ({ page }) => {
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

  await page.goto('/live-tracking')

  await expect(page.getByTestId('contract-option-12')).toHaveText('REF-012')
})

test('an admin sees every contract with its client name (FR2)', async ({ page }) => {
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
  await page.getByTestId('contract-option-12').click()

  const markers = page.locator('.leaflet-marker-icon')
  await expect(markers).toHaveCount(1)

  await markers.first().focus()
  await expect(page.locator('.leaflet-tooltip')).toContainText('10/10/2026 08:00 UTC')
  await expect(page.locator('.leaflet-tooltip')).toContainText('Masse: 420 kg')
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
  await page.getByTestId('contract-option-12').click()

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

test('shows the global and per-contract messages as plain text, the logo when flagged, and a History Dashboard link carrying contract + date range (FR11, FR12, FR13, FR14)', async ({
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
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ positions: [] }) }),
  )
  await page.route('**/messages/global.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: { date: '2026-10-10T08:00:00+00:00', contenu: '<b>Maintenance</b> ce soir.' },
      }),
    }),
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

  // FR11: global message shown immediately, as the literal text it is in
  // the API response — never parsed as HTML (no <b> element rendered).
  await expect(page.getByTestId('global-message')).toContainText('<b>Maintenance</b> ce soir.')
  expect(await page.locator('[data-testid="global-message"] b').count()).toBe(0)

  // FR1 (KAN-161): logo shown once the unified endpoint serves the image.
  await expect(page.getByTestId('client-logo')).toBeVisible()

  // FR14: no History Dashboard link before a contract is selected.
  await expect(page.getByTestId('history-dashboard-link')).toHaveCount(0)

  await page.getByTestId('contract-option-12').click()

  // FR12: per-contract message shown once selected.
  await expect(page.getByTestId('contract-message')).toContainText('Message du contrat 12.')

  // FR14: link now present, carrying contrat_id + date_from + date_to.
  const href = await page.getByTestId('history-dashboard-link').getAttribute('href')
  expect(href).toContain('/history?')
  const params = new URLSearchParams(href!.split('?')[1])
  expect(params.get('contrat_id')).toBe('12')
  expect(params.get('date_from')).toBeTruthy()
  expect(params.get('date_to')).toBeTruthy()
})

test('primary flow: login-gated access, select a contract, markers render, refresh updates "last updated", open History Dashboard (KAN-168)', async ({
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
  await page.route('**/messages/global.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: null }) }),
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

  await page.getByTestId('contract-option-12').click()

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

  const historyHref = await page.getByTestId('history-dashboard-link').getAttribute('href')
  expect(historyHref).toContain('/history?')
  expect(historyHref).toContain('contrat_id=12')
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
  await page.getByTestId('contract-option-99').click()

  await expect(page.getByTestId('contract-access-error')).toBeVisible()
  await expect(page.getByTestId('contract-option-99')).toHaveAttribute('aria-checked', 'false')
  expect(await page.getByTestId('contract-access-error').textContent()).not.toContain('99')
})

/**
 * KAN-161 (FR1-FR4, NFR6, NFR7) — Logo Rendering & Unified-404 Error
 * Handling. Supersedes KAN-165's own logo coverage above (which only
 * asserted the success path): every non-success logo outcome must render
 * one identical, empty placeholder, and an admin/no-ClientID account must
 * never even request the logo.
 */

test('renders a neutral, empty placeholder — not nothing, not an error — on the unified 404 (FR3, NFR7)', async ({
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

  await expect(page.getByTestId('client-logo-placeholder')).toBeVisible()
  await expect(page.getByTestId('client-logo')).toHaveCount(0)
  expect((await page.getByTestId('client-logo-placeholder').textContent())?.trim()).toBe('')
})

test('renders the exact same placeholder on a network/service failure as on the unified 404 (FR3, NFR7)', async ({
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

  await expect(page.getByTestId('client-logo-placeholder')).toBeVisible()
  await expect(page.getByTestId('client-logo')).toHaveCount(0)
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

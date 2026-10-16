import { test, expect } from '@playwright/test'

/**
 * KAN-174 (FR10-18, NFR1, NFR3) — the History Dashboard's time-slider /
 * trail / replay map. KAN-172's `history-dashboard.spec.ts` already covers
 * the gate/selector/access-denied states (FR1, FR2, FR25) — this file only
 * exercises what mounts inside `history-dashboard-ready` once a contract is
 * accessible: the map, slider, trail toggle, replay button and fit button.
 *
 * Run against a real browser (Chromium, via `playwright.config.ts`'s
 * `webServer`, same "build + preview, mock `/api/v1` with `page.route`"
 * pattern every other spec in this repo uses — NFR2's "running local/
 * staging build"). This is the layer that actually renders Leaflet's SVG
 * trail (`<Polyline>`), which jsdom cannot (see `TimelineMap.test.tsx`'s
 * comment) — the one interaction in this story that genuinely needs a real
 * browser rather than Vitest/Testing Library.
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

const contracts = [{ contractId: 12, contractRef: 'REF-012', contractType: 'STD' }]

// Two devices, two readings each, 1 hour apart, so the slider's default
// position (series end) shows both, and scrubbing to the first instant
// shows only CHIP-A (CB20/FR12).
const T0 = Date.UTC(2026, 9, 1, 8, 0, 0)
const T1 = Date.UTC(2026, 9, 1, 9, 0, 0)

function historyBody() {
  return {
    contract: {
      ContratID: 12,
      ContratRef: 'REF-012',
      ContratType: 'STD',
      ClientID: 7,
      DebutContrat: null,
      FinContrat: null,
    },
    devices: [
      { ChipID: 'CHIP-A', STATUT: 'actif', MORT: 0 },
      { ChipID: 'CHIP-B', STATUT: 'actif', MORT: 0 },
    ],
    rows: [
      { c: 'CHIP-A', t: T0, ts: '2026-10-01T08:00:00', p: 1, la: 43.5, lo: 5.4, ta: 18, hr: 50, m: 150, g: 1, tm: 20 },
      { c: 'CHIP-A', t: T1, ts: '2026-10-01T09:00:00', p: 1, la: 43.6, lo: 5.5, ta: 19, hr: 51, m: 160, g: 1, tm: 21 },
      { c: 'CHIP-B', t: T1, ts: '2026-10-01T09:00:00', p: 1, la: 44.0, lo: 6.0, ta: 22, hr: 60, m: 520, g: 1, tm: 23 },
    ],
    hooks: [],
    count: 3,
    total: 3,
    sampled: false,
  }
}

async function mockToReadyState(page: import('@playwright/test').Page) {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts }) }),
  )
  await page.route('**/contracts/history.php/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(historyBody()) }),
  )

  await page.goto('/history')
  await page.getByTestId('history-contract-option-12').click()
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2)
}

test('renders one marker per device at the slider default (series end), colored by palette/mass (FR10, FR11)', async ({
  page,
}) => {
  await mockToReadyState(page)

  // CHIP-B's mass (520) is >= 500 -> green fill (CB21).
  const icons = page.locator('.leaflet-marker-icon > div')
  await expect(icons).toHaveCount(2)
  const backgrounds = await icons.evaluateAll((nodes) => nodes.map((n) => (n as HTMLElement).style.background))
  expect(backgrounds.some((bg) => bg.includes('46, 125, 50') || bg === 'rgb(46, 125, 50)')).toBe(true)
})

test('scrubbing the slider to the first instant shows only the device with a reading that early (FR12, CB20)', async ({
  page,
}) => {
  await mockToReadyState(page)

  const slider = page.getByTestId('timeline-slider')
  await slider.fill(String(T0))
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1)
  await expect(page.getByTestId('timeline-instant-label')).toContainText('2026-10-01')
})

test('hovering a marker shows its tooltip with the measurement fields (FR13)', async ({ page }) => {
  await mockToReadyState(page)

  await page.locator('.leaflet-marker-icon').first().hover()
  await expect(page.locator('.leaflet-tooltip')).toContainText('Température amb.')
  await expect(page.locator('.leaflet-tooltip')).toContainText('Masse')
})

test('"Afficher la trace" draws a trail polyline once checked (FR14, CB23)', async ({ page }) => {
  await mockToReadyState(page)

  await expect(page.locator('path.leaflet-interactive')).toHaveCount(0)
  await page.getByTestId('timeline-trail-toggle').check()
  await expect(page.locator('path.leaflet-interactive')).not.toHaveCount(0)
})

test('"Rejouer" animates the slider to the end and the button reverts to "Rejouer" (FR18, CB24)', async ({
  page,
}) => {
  // A short (2s) span keeps CB24's replay step (max(1000, floor(span/200)))
  // at its 1000ms floor, so the whole animation finishes in a couple of
  // 80ms ticks of real wall-clock time instead of the ~16s a realistic
  // 1-hour span (the other tests' fixture) would take to play out for
  // real — this test only needs to prove the animation starts, advances,
  // and stops itself, not exercise a true full-length replay.
  const shortT1 = T0 + 2000
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts }) }),
  )
  await page.route('**/contracts/history.php/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...historyBody(),
        rows: [
          { c: 'CHIP-A', t: T0, ts: '2026-10-01T08:00:00', p: 1, la: 43.5, lo: 5.4, ta: 18, hr: 50, m: 150, g: 1, tm: 20 },
          { c: 'CHIP-A', t: shortT1, ts: '2026-10-01T08:00:02', p: 1, la: 43.6, lo: 5.5, ta: 19, hr: 51, m: 160, g: 1, tm: 21 },
        ],
      }),
    }),
  )

  await page.goto('/history')
  await page.getByTestId('history-contract-option-12').click()
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1)

  const playButton = page.getByTestId('timeline-play-toggle')
  await expect(playButton).toHaveText('Rejouer')
  await playButton.click()
  await expect(playButton).toHaveText('Pause')
  await expect(playButton).toHaveText('Rejouer', { timeout: 5000 })
  await expect(page.getByTestId('timeline-slider')).toHaveValue(String(shortT1))
})

test('"Ajuster" re-fits the map without erroring and without a refetch (FR15, NFR3)', async ({ page }) => {
  let historyRequests = 0
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts }) }),
  )
  await page.route('**/contracts/history.php/**', (route) => {
    historyRequests++
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(historyBody()) })
  })

  await page.goto('/history')
  await page.getByTestId('history-contract-option-12').click()
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2)

  const requestsAfterLoad = historyRequests
  await page.getByTestId('timeline-fit').click()
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2)
  expect(historyRequests).toBe(requestsAfterLoad)
})

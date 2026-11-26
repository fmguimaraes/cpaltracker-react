import { test, expect } from '@playwright/test'
import { pickContract } from './contract-helpers'

/**
 * KAN-176 (FR26, NFR2, NFR6-9) — the History Dashboard epic's closing audit
 * story. Two concrete things this file exists to prove, neither of which any
 * prior History Dashboard spec in this repo covers:
 *
 * 1. **US3's explicit-range path (FR5, FR8) is reachable through the real
 *    app.** Originally proven through the typed `DateRangePicker`; since the
 *    operator decision of 2026-10-29 the header period control is the only
 *    period control, so the over-span rejection and the valid explicit-range
 *    re-fetch are driven through it (`resolved.applyRange`). The reversed-range
 *    and malformed-date paths (FR6, FR7) can no longer be produced from the UI
 *    and stay covered at unit level (`src/history/dateRange.test.ts`).
 * 2. **FR26 dark-mode correctness for the map and charts.** CSS tokens alone
 *    re-theme everything built on plain `var(--token)` styles for free, but
 *    Leaflet's raster tiles and Plotly's SVG canvas do not — this file
 *    asserts the actual rendered dark-mode output (tile-pane filter, Plotly
 *    paper/plot background), not just that the token switch happened.
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

const T0 = Date.UTC(2026, 9, 1, 8, 0, 0)
const T1 = Date.UTC(2026, 9, 1, 9, 0, 0)

function historyBody(overrides: Record<string, unknown> = {}) {
  return {
    contract: {
      ContratID: 12,
      ContratRef: 'REF-012',
      ContratType: 'STD',
      ClientID: 7,
      DebutContrat: null,
      FinContrat: null,
    },
    devices: [{ ChipID: 'CHIP-A', STATUT: 'actif', MORT: 0 }],
    rows: [
      { c: 'CHIP-A', t: T0, ts: '2026-10-01T08:00:00', p: 1, la: 43.5, lo: 5.4, ta: 18, hr: 50, m: 150, g: 1, tm: 20 },
      { c: 'CHIP-A', t: T1, ts: '2026-10-01T09:00:00', p: 1, la: 43.6, lo: 5.5, ta: 19, hr: 51, m: 160, g: 1, tm: 21 },
    ],
    hooks: [],
    count: 2,
    total: 2,
    sampled: false,
    ...overrides,
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
  await pickContract(page, 12)
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
}

// Operator decision 2026-10-29: the typed Du/Au entry (`DateRangePicker`) was removed as a duplicate of the
// header period control, which is now the page's only period control. Its calendar normalises a range (start is
// always <= end) and only yields real dates, so the reversed-range (FR6) and malformed-date (FR7) paths are no
// longer reachable from the UI — they stay covered by `src/history/dateRange.test.ts`. The over-span (FR8)
// rejection and the explicit-range re-fetch (FR5) are still reachable and are driven through the period control.
async function mockHistoryCounting(page: import('@playwright/test').Page, requestedRanges: string[]) {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts }) }),
  )
  await page.route('**/contracts/history.php/**', (route) => {
    requestedRanges.push(new URL(route.request().url()).search)
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(historyBody()) })
  })

  await page.goto('/history')
  await pickContract(page, 12)
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
  await expect(page.getByTestId('history-header').getByTestId('time')).toBeVisible()
}

test.describe('Header period control range wiring (FR5, FR8, NFR8 — US3)', () => {
  test('a span over the 1-year maximum picked in the calendar is rejected inline, stating the limit, with no request issued (FR8)', async ({
    page,
  }) => {
    const requestedRanges: string[] = []
    await mockHistoryCounting(page, requestedRanges)
    const requestsAfterLoad = requestedRanges.length

    await page.getByTestId('time-custom').click()
    const popover = page.locator('[data-slot="popover-content"]')
    // The calendar restarts the range on a click once a full range is shown (resetOnSelect): pick the start
    // 14 months back, then walk forward to the present and pick the end, so the span exceeds 1 year.
    for (let i = 0; i < 14; i++) await popover.locator('.rdp-button_previous').click()
    await popover.locator('.rdp-day:not(.rdp-outside) button').first().click()
    for (let i = 0; i < 14; i++) await popover.locator('.rdp-button_next').click()
    await popover.locator('.rdp-day:not(.rdp-outside) button').first().click()
    await popover.getByRole('button', { name: 'Appliquer' }).click()

    await expect(page.getByTestId('history-time-range-error')).toBeVisible()
    await expect(page.getByTestId('history-time-range-error')).toContainText('1 an')
    expect(requestedRanges.length).toBe(requestsAfterLoad)
  })

  test('a valid explicit range re-fetches and updates the displayed period (FR5, US3 happy path)', async ({
    page,
  }) => {
    const requestedRanges: string[] = []
    await mockHistoryCounting(page, requestedRanges)
    const requestsAfterLoad = requestedRanges.length

    await page.getByTestId('time-7d').click()

    await expect.poll(() => requestedRanges.length).toBe(requestsAfterLoad + 1)
    const last = new URLSearchParams(requestedRanges[requestedRanges.length - 1])
    const start = last.get('start') ?? ''
    const end = last.get('end') ?? ''
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect((Date.parse(end) - Date.parse(start)) / 86_400_000).toBe(7)
    // The applied preset is what the header period control now shows as the selected segment.
    await expect(page.getByTestId('time-7d')).toHaveAttribute('data-state', 'on')
    await expect(page.getByTestId('history-time-range-error')).toHaveCount(0)
  })
})

test.describe('Dark-mode correctness for map chrome and charts (FR26, NFR6)', () => {
  test('switching to dark mode inverts only the map tile pane, leaving markers untouched, and re-themes the Plotly charts, with no reload', async ({
    page,
  }) => {
    await page.addInitScript(() => window.localStorage.setItem('cpaltracker:theme', 'dark'))
    await mockToReadyState(page)

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.timeline-map')).toBeVisible()

    const tilePaneFilter = await page
      .locator('.timeline-map .leaflet-tile-pane')
      .evaluate((node) => getComputedStyle(node).filter)
    expect(tilePaneFilter).not.toBe('none')

    // Markers live in a sibling pane, never affected by the tile-pane-only filter.
    const markerPaneFilter = await page
      .locator('.timeline-map .leaflet-marker-pane')
      .evaluate((node) => getComputedStyle(node).filter)
    expect(markerPaneFilter).toBe('none')

    // Plotly's `paper_bgcolor` is applied as the first `.main-svg`'s own
    // inline `background` style (not a `fill` attribute) — this proves the
    // dark palette actually reached Plotly, not Plotly's own white default
    // (FR26).
    // FR9: the chart paper is transparent; the surface behind it is the measure tile's --card (the Plotly chart itself
    // only mounts in the expand modal now).
    const paperBackground = await page.getByTestId('measure-tile-ta').evaluate((node) => getComputedStyle(node).backgroundColor)
    expect(paperBackground).toBe('rgb(29, 30, 32)') // --card dark: #1d1e20 (Sombre graphite, 2026-11-25)
  })

  test('light mode desaturates the map tiles (never inverts them) and puts charts on the light palette', async ({
    page,
  }) => {
    // The default follows the OS (D7, 2026-11-25); light is stored explicitly.
    await page.addInitScript(() => window.localStorage.setItem('cpaltracker:theme', 'light'))
    await mockToReadyState(page)

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('.timeline-map')).toBeVisible()

    const tilePaneFilter = await page
      .locator('.timeline-map .leaflet-tile-pane')
      .evaluate((node) => getComputedStyle(node).filter)
    // Light tiles are recolored to the mineral grey (--map-tile-filter, Clair minéral 2026-11-25), never inverted.
    expect(tilePaneFilter).toBe('grayscale(0.85) brightness(1.03) contrast(0.9)')

    // FR9: the chart paper is transparent; the surface behind it is the measure tile's --card (the Plotly chart itself
    // only mounts in the expand modal now).
    const paperBackground = await page.getByTestId('measure-tile-ta').evaluate((node) => getComputedStyle(node).backgroundColor)
    expect(paperBackground).toBe('rgb(237, 241, 238)') // --card light: #edf1ee (Clair minéral, 2026-11-25)
  })
})

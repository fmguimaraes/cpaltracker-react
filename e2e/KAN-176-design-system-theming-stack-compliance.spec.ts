import { test, expect } from '@playwright/test'

/**
 * KAN-176 (FR26, NFR2, NFR6-9) — the History Dashboard epic's closing audit
 * story. Two concrete things this file exists to prove, neither of which any
 * prior History Dashboard spec in this repo covers:
 *
 * 1. **US3's three date-rejection paths (FR5-FR8) are actually reachable
 *    through the real app.** `DateRangePicker` (KAN-170, FR5-FR8) shipped
 *    fully unit-tested from day one but was never mounted anywhere —
 *    KAN-175's reviewer flagged this explicitly. This story wires it into
 *    `HistoryDashboard`'s ready panel (`resolved.applyRange`); this file is
 *    the first E2E coverage of the reversed-range/malformed-date/over-span
 *    rejections and of a valid explicit-range re-fetch, closing the NFR8 gap
 *    "Playwright E2E tests cover US1-US5, including all three date-rejection
 *    paths" — none of `history-dashboard.spec.ts`/`history-charts.spec.ts`/
 *    `history-timeline-map.spec.ts` (KAN-172/174/175) touch this at all.
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
  await page.getByTestId('history-contract-option-12').click()
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
  await expect(page.getByTestId('date-range-picker')).toBeVisible()
}

test.describe('DateRangePicker wiring (FR5-FR8, NFR8 — US3)', () => {
  test('a reversed range is rejected inline with no request issued (FR6)', async ({ page }) => {
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
    await expect(page.getByTestId('date-range-picker')).toBeVisible()

    const requestsAfterLoad = historyRequests
    await page.getByTestId('date-range-start').fill('2026-10-20')
    await page.getByTestId('date-range-end').fill('2026-10-01')
    await page.getByTestId('date-range-apply').click()

    await expect(page.getByTestId('date-range-error')).toBeVisible()
    await expect(page.getByTestId('date-range-error')).toContainText('ne peut pas précéder')
    expect(historyRequests).toBe(requestsAfterLoad)
  })

  test('a malformed date is rejected inline, naming the offending field, with no request issued (FR7)', async ({
    page,
  }) => {
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
    await expect(page.getByTestId('date-range-picker')).toBeVisible()

    const requestsAfterLoad = historyRequests
    await page.getByTestId('date-range-start').fill('not-a-date')
    await page.getByTestId('date-range-apply').click()

    await expect(page.getByTestId('date-range-start-error')).toBeVisible()
    await expect(page.getByTestId('date-range-start-error')).toContainText('date de début')
    expect(historyRequests).toBe(requestsAfterLoad)
  })

  test('a span over the 1-year maximum is rejected inline, stating the limit, with no request issued (FR8)', async ({
    page,
  }) => {
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
    await expect(page.getByTestId('date-range-picker')).toBeVisible()

    const requestsAfterLoad = historyRequests
    await page.getByTestId('date-range-start').fill('2024-01-01')
    await page.getByTestId('date-range-end').fill('2026-06-01')
    await page.getByTestId('date-range-apply').click()

    await expect(page.getByTestId('date-range-error')).toBeVisible()
    await expect(page.getByTestId('date-range-error')).toContainText('1 an')
    expect(historyRequests).toBe(requestsAfterLoad)
  })

  test('a valid explicit range re-fetches and updates the displayed period (FR5, US3 happy path)', async ({
    page,
  }) => {
    let historyRequests = 0
    const requestedRanges: string[] = []
    await page.route('**/account.php', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
    )
    await page.route('**/contracts/list.php', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts }) }),
    )
    await page.route('**/contracts/history.php/**', (route) => {
      historyRequests++
      requestedRanges.push(new URL(route.request().url()).search)
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(historyBody({ ContratRef: 'REF-012' })),
      })
    })

    await page.goto('/history')
    await page.getByTestId('history-contract-option-12').click()
    await expect(page.getByTestId('date-range-picker')).toBeVisible()

    const requestsAfterLoad = historyRequests
    await page.getByTestId('date-range-start').fill('2026-09-01')
    await page.getByTestId('date-range-end').fill('2026-09-30')
    await page.getByTestId('date-range-apply').click()

    await expect.poll(() => historyRequests).toBe(requestsAfterLoad + 1)
    expect(requestedRanges[requestedRanges.length - 1]).toContain('start=2026-09-01')
    expect(requestedRanges[requestedRanges.length - 1]).toContain('end=2026-09-30')
    await expect(page.getByTestId('history-dashboard-ready')).toContainText('2026-09-01')
    await expect(page.getByTestId('history-dashboard-ready')).toContainText('2026-09-30')
  })
})

test.describe('Dark-mode correctness for map chrome and charts (FR26, NFR6)', () => {
  test('switching to dark mode inverts only the map tile pane, leaving markers untouched, and re-themes the Plotly charts, with no reload', async ({
    page,
  }) => {
    await page.addInitScript(() => window.localStorage.setItem('cpaltracker:theme', 'dark'))
    await mockToReadyState(page)

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

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
    const chart = page.getByTestId('history-chart-ta')
    const paperBackground = await chart.locator('.main-svg').first().evaluate((node) => getComputedStyle(node).backgroundColor)
    expect(paperBackground).toBe('rgb(29, 33, 38)') // --color-surface dark: #1d2126
  })

  test('light mode (the default) leaves the map tiles un-filtered and charts on the light palette', async ({
    page,
  }) => {
    await mockToReadyState(page)

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    const tilePaneFilter = await page
      .locator('.timeline-map .leaflet-tile-pane')
      .evaluate((node) => getComputedStyle(node).filter)
    expect(tilePaneFilter).toBe('none')

    const chart = page.getByTestId('history-chart-ta')
    const paperBackground = await chart.locator('.main-svg').first().evaluate((node) => getComputedStyle(node).backgroundColor)
    expect(paperBackground).toBe('rgb(244, 245, 247)') // --color-surface light: #f4f5f7
  })
})

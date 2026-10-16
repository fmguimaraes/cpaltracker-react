import { test, expect } from '@playwright/test'

/**
 * KAN-175 (FR4, FR9, FR19-24, NFR3) — the device checklist, three Plotly
 * charts, lot-hook history, sampling banner and selection summary. Run
 * against a real browser (same "build + preview, mock `/api/v1` with
 * `page.route`" pattern every other spec in this repo uses) because Plotly
 * actually needs a real `<canvas>`/WebGL context to render — exactly the
 * jsdom gap `HistoryCharts.test.tsx` documents and defers to this file for.
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
    devices: [
      { ChipID: 'CHIP-A', STATUT: 'actif', MORT: 0 },
      { ChipID: 'CHIP-B', STATUT: 'actif', MORT: 0 },
    ],
    rows: [
      { c: 'CHIP-A', t: T0, ts: '2026-10-01T08:00:00', p: 1, la: 43.5, lo: 5.4, ta: 18, hr: 50, m: 150, g: 1, tm: 20 },
      { c: 'CHIP-A', t: T1, ts: '2026-10-01T09:00:00', p: 1, la: 43.6, lo: 5.5, ta: 19, hr: 51, m: 160, g: 1, tm: 21 },
      { c: 'CHIP-B', t: T1, ts: '2026-10-01T09:00:00', p: 1, la: 44.0, lo: 6.0, ta: 22, hr: 60, m: 520, g: 1, tm: 23 },
    ],
    hooks: [
      { c: 'CHIP-A', lot: 42, cust: 'CUST-1', from: T0, to: T1 + 3600_000, net: 100, gros: 110, nb: 5, per: '2026-12-31' },
    ],
    count: 3,
    total: 3,
    sampled: false,
    ...overrides,
  }
}

async function mockToReadyState(page: import('@playwright/test').Page, body = historyBody()) {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts }) }),
  )
  await page.route('**/contracts/history.php/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }),
  )

  await page.goto('/history')
  await page.getByTestId('history-contract-option-12').click()
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
}

test('device checklist lists every device, selected by default (FR9)', async ({ page }) => {
  await mockToReadyState(page)

  await expect(page.getByTestId('device-checklist-item-CHIP-A')).toBeChecked()
  await expect(page.getByTestId('device-checklist-item-CHIP-B')).toBeChecked()
})

test('unchecking a device filters the map marker, the charts and the summary with no refetch (FR9, FR20, NFR3)', async ({
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
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2)

  const requestsAfterLoad = historyRequests
  await page.getByTestId('device-checklist-item-CHIP-B').uncheck()

  await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1)
  // CHIP-B is unchecked, leaving only CHIP-A's 2 rows (T0, T1) selected.
  await expect(page.getByTestId('selection-summary-count')).toContainText('2 mesure(s)')
  await expect(page.getByTestId('selection-summary-device-count')).toContainText('1 appareil(s)')
  expect(historyRequests).toBe(requestsAfterLoad)
})

test('renders the three Plotly charts (temperature, humidity, mass) with one trace per device (FR19)', async ({
  page,
}) => {
  await mockToReadyState(page)

  for (const field of ['ta', 'hr', 'm']) {
    const chart = page.getByTestId(`history-chart-${field}`)
    await expect(chart.locator('.js-plotly-plot')).toBeVisible()
    await expect(chart.locator('.scatterlayer .trace')).toHaveCount(2)
  }
})

test('renders the lot-hook history row for the active hook (FR21)', async ({ page }) => {
  await mockToReadyState(page)

  await expect(page.getByTestId('lot-hook-history')).toBeVisible()
  await expect(page.getByTestId('lot-hook-row-0')).toContainText('CHIP-A')
  await expect(page.getByTestId('lot-hook-row-0')).toContainText('42')
})

test('degrades the lot-hook section to an empty-state message when there are no hooks (FR21, CB15)', async ({
  page,
}) => {
  await mockToReadyState(page, historyBody({ hooks: [] }))

  await expect(page.getByTestId('lot-hook-history-empty')).toBeVisible()
})

test('shows the sampling banner naming both counts when the response is flagged sampled (FR22)', async ({
  page,
}) => {
  await mockToReadyState(page, historyBody({ sampled: true, count: 3, total: 9000 }))

  const banner = page.getByTestId('history-sampling-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('3')
  await expect(banner).toContainText('9000')
})

test('shows "no measurements" instead of empty panels for a zero-row result (FR23)', async ({ page }) => {
  await mockToReadyState(page, historyBody({ rows: [], count: 0 }))

  await expect(page.getByTestId('history-no-measurements')).toBeVisible()
})

test('the selection summary recomputes min/max ambient temperature on every selection change (FR24)', async ({
  page,
}) => {
  await mockToReadyState(page)

  await expect(page.getByTestId('selection-summary-temp-range')).toContainText('18.0°C')
  await expect(page.getByTestId('selection-summary-temp-range')).toContainText('22.0°C')

  await page.getByTestId('device-checklist-item-CHIP-B').uncheck()

  await expect(page.getByTestId('selection-summary-temp-range')).toContainText('18.0°C')
  await expect(page.getByTestId('selection-summary-temp-range')).toContainText('19.0°C')
})

test('a fetch failure shows a dismissible error banner (FR4, FR23)', async ({ page }) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts }) }),
  )
  await page.route('**/contracts/history.php/**', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'service_unavailable', message: 'DB down' } }),
    }),
  )

  await page.goto('/history')
  await page.getByTestId('history-contract-option-12').click()

  const banner = page.getByTestId('history-fetch-error')
  await expect(banner).toBeVisible()
  await page.getByTestId('history-fetch-error-dismiss').click()
  await expect(banner).toHaveCount(0)
})

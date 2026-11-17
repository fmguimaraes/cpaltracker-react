import { test, expect } from '@playwright/test'
import { pickContract } from './contract-helpers'

/**
 * KAN-175 (FR4, FR9, FR19-24, NFR3) — the device checklist, compact measure
 * tiles + expand modal (KAN-252), lot-hook history, sampling banner and
 * selection summary. Run against a real browser (same "build + preview,
 * mock `/api/v1` with `page.route`" pattern every other spec in this repo
 * uses) because Plotly actually needs a real `<canvas>`/WebGL context to
 * render — exactly the jsdom gap `HistoryCharts.test.tsx`/`MeasureChartModal.test.tsx`
 * document and defer to this file for.
 *
 * KAN-252: the three Plotly charts no longer render inline — they only
 * mount inside `MeasureChartModal` once a tile's expand button is clicked.
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

const MEASURE_META: Record<string, { label: string; unit: string; last: number; min: number; max: number }> = {
  ta: { label: 'Température ambiante', unit: '°C', last: 22, min: 18, max: 22 },
  hr: { label: 'Humidité relative', unit: '%', last: 60, min: 50, max: 60 },
  m: { label: 'Masse', unit: 'kg', last: 520, min: 150, max: 520 },
}

function measureSummary(field: 'ta' | 'hr' | 'm') {
  const meta = MEASURE_META[field]
  return {
    label: meta.label,
    unit: meta.unit,
    decimals: 1,
    stableBand: 0.5,
    last: meta.last,
    lastAt: '2026-10-01T09:00:00Z',
    min: meta.min,
    minAt: '2026-10-01T08:00:00Z',
    max: meta.max,
    maxAt: '2026-10-01T09:00:00Z',
    mean: (meta.min + meta.max) / 2,
    count: 3,
    periodChange: meta.last - meta.min,
    change24h: meta.last - meta.min,
    change24hRef: '2026-10-01T08:00:00Z',
    trend: 'rising' as const,
    excursions: null,
    sparkline: [
      ['2026-10-01T08:00:00Z', meta.min],
      ['2026-10-01T09:00:00Z', meta.last],
    ] as Array<[string, number]>,
  }
}

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
    summaries: { ta: measureSummary('ta'), hr: measureSummary('hr'), m: measureSummary('m') },
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
  await pickContract(page, 12)
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
  await pickContract(page, 12)
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

test('renders a compact tile per measure, and expanding one opens the full chart in a modal (KAN-252 FR10-FR14, FR19)', async ({
  page,
}) => {
  await mockToReadyState(page)

  for (const field of ['ta', 'hr', 'm'] as const) {
    const tile = page.getByTestId(`history-chart-${field}`)
    await expect(tile).toBeVisible()
    // The tile itself never mounts Plotly (NFR6's compact row) — no chart inline.
    await expect(tile.locator('.js-plotly-plot')).toHaveCount(0)
  }

  const modal = page.getByTestId('measure-chart-modal')
  const modalPlot = page.getByTestId('measure-chart-modal-plot')

  // Open from the temperature tile, then switch measure via the modal's own tabs (FR12) rather
  // than closing/reopening each time — exercises the single always-mounted modal instance.
  await page.getByRole('button', { name: `Agrandir ${MEASURE_META.ta.label}` }).click()
  await expect(modal).toBeVisible()

  for (const field of ['ta', 'hr', 'm'] as const) {
    await page.getByTestId(`measure-tab-${field}`).click()
    await expect(page.getByTestId(`measure-tab-${field}`)).toHaveAttribute('aria-pressed', 'true')
    await expect(modalPlot.locator('.js-plotly-plot')).toBeVisible()
    // `.scatterlayer.rangeplot` is the built-in range-slider's own mini duplicate of every
    // trace (FR12's "zoom slider stays here, and only here") — excluded so the count reflects
    // the main plot's traces (one per device), not that duplicate.
    await expect(modalPlot.locator('.scatterlayer:not(.rangeplot) .trace')).toHaveCount(2)
  }

  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
  await expect(modalPlot).toHaveCount(0)
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

  await expect(page.getByTestId('selection-summary-temp-range')).toContainText('18.0°')
  await expect(page.getByTestId('selection-summary-temp-range')).toContainText('22.0°')

  await page.getByTestId('device-checklist-item-CHIP-B').uncheck()

  await expect(page.getByTestId('selection-summary-temp-range')).toContainText('18.0°')
  await expect(page.getByTestId('selection-summary-temp-range')).toContainText('19.0°')
})

test('the expand modal stacks above the map on the same page (KAN-252 bugfix: dialog z-index vs map controls)', async ({
  page,
}) => {
  await mockToReadyState(page)

  await page.getByRole('button', { name: 'Agrandir Température ambiante' }).click()
  const modalContent = page.locator('[data-slot="dialog-content"]')
  await expect(modalContent).toBeVisible()

  const mapZIndex = await page
    .getByTestId('timeline-trail-toggle')
    .evaluate((el) => Number(getComputedStyle(el.parentElement ?? el).zIndex) || 0)
  const dialogZIndex = await modalContent.evaluate((el) => Number(getComputedStyle(el).zIndex) || 0)

  expect(dialogZIndex).toBeGreaterThan(mapZIndex)

  // The dialog's own stacking context must resolve above Leaflet's panes visually too, not just
  // on paper: a click where the two visually overlap should land on the modal, not the map.
  const closeButton = page.getByRole('button', { name: 'Close' })
  await expect(closeButton).toBeVisible()
  await closeButton.click()
  await expect(modalContent).toBeHidden()
})

test('dragging the modal chart\'s built-in rangeslider zooms the chart (KAN-252 bugfix: FR12 slider swallowed by dialog pointer-events lockout)', async ({
  page,
}) => {
  await mockToReadyState(page)

  await page.getByRole('button', { name: 'Agrandir Température ambiante' }).click()
  const modalPlot = page.getByTestId('measure-chart-modal-plot')
  await expect(modalPlot.locator('.js-plotly-plot')).toBeVisible()

  const slidebox = modalPlot.locator('.rangeslider-slidebox')
  await expect(slidebox).toBeVisible()
  const box = await slidebox.boundingBox()
  if (!box) throw new Error('rangeslider-slidebox has no bounding box')

  const before = await modalPlot.locator('.js-plotly-plot').evaluate(
    (el) => (el as unknown as { _fullLayout: { xaxis: { range: [string, string] } } })._fullLayout.xaxis.range,
  )

  // Drag the whole slidebox window (not a handle) a third of its width to the right — the
  // built-in Plotly pan gesture (FR12). Real OS-level pointer events via Playwright's CDP-backed
  // `page.mouse`, same mechanism Radix's dialog pointer-events lockout (`body { pointer-events:
  // none }`) would otherwise swallow past the initial mousedown.
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width * 0.3, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 5 })
  await page.mouse.move(box.x + box.width * 0.6, y, { steps: 5 })
  await page.mouse.up()

  const after = await modalPlot.locator('.js-plotly-plot').evaluate(
    (el) => (el as unknown as { _fullLayout: { xaxis: { range: [string, string] } } })._fullLayout.xaxis.range,
  )

  expect(after).not.toEqual(before)
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
  await pickContract(page, 12)

  const banner = page.getByTestId('history-fetch-error')
  await expect(banner).toBeVisible()
  await page.getByTestId('history-fetch-error-dismiss').click()
  await expect(banner).toHaveCount(0)
})

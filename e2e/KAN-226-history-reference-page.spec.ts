import { test, expect, type Page } from '@playwright/test'

/**
 * KAN-226 (epic KAN-217) - /history on the reference History page (FR9, FR13-FR15 for these files).
 * Scenarios: cpal.docs/manual-e2e/KAN-217-History.md (all automated).
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

// CHIP-A has no mass reading at all: the second device must keep its slot on every chart (K-7).
function historyBody(overrides: Record<string, unknown> = {}) {
  return {
    contract: { ContratID: 12, ContratRef: 'REF-012', ContratType: 'STD', ClientID: 7, DebutContrat: null, FinContrat: null },
    devices: [
      { ChipID: 'CHIP-A', STATUT: 'actif', MORT: 0 },
      { ChipID: 'CHIP-B', STATUT: 'actif', MORT: 0 },
    ],
    rows: [
      { c: 'CHIP-A', t: T0, ts: '2026-10-01T08:00:00', p: 1, la: 43.5, lo: 5.4, ta: 5, hr: 50, m: null, g: 1, tm: 20 },
      { c: 'CHIP-A', t: T1, ts: '2026-10-01T09:00:00', p: 1, la: 43.6, lo: 5.5, ta: 6, hr: 51, m: null, g: 1, tm: 21 },
      { c: 'CHIP-B', t: T1, ts: '2026-10-01T09:00:00', p: 1, la: 44.0, lo: 6.0, ta: 7, hr: 60, m: 520, g: 1, tm: 23 },
    ],
    hooks: [],
    count: 3,
    total: 3,
    sampled: false,
    ...overrides,
  }
}

async function openReady(page: Page, body: Record<string, unknown> = {}, onHistory?: (url: string) => void) {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts }) }),
  )
  await page.route('**/contracts/history.php/**', (route) => {
    onHistory?.(route.request().url())
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(historyBody(body)) })
  })
  await page.goto('/history')
  await page.getByTestId('history-contract-option-12').click()
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
}

test.describe('KAN-226 history on the reference page', () => {
  test('TimePicker in the header applies a preset as a day range; the typed entry sits next to it @SI-226-1', async ({
    page,
  }) => {
    const urls: string[] = []
    await openReady(page, {}, (url) => urls.push(url))

    const header = page.getByTestId('page-header')
    await expect(header.getByTestId('time-picker')).toBeVisible()
    await expect(page.getByTestId('date-range-start')).toBeVisible()
    await expect(page.getByTestId('date-range-start')).toHaveAttribute('placeholder', 'AAAA-MM-JJ')

    const before = urls.length
    await header.getByTestId('time-7d').click()
    await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
    await expect.poll(() => urls.length).toBeGreaterThan(before)
    expect(urls[urls.length - 1]).toMatch(/start=\d{4}-\d{2}-\d{2}&end=\d{4}-\d{2}-\d{2}/)
  })

  test('typed entry keeps its French validation: a malformed date is rejected with no request @SI-226-1', async ({
    page,
  }) => {
    const urls: string[] = []
    await openReady(page, {}, (url) => urls.push(url))
    const before = urls.length
    await page.getByTestId('date-range-start').fill('not-a-date')
    await page.getByTestId('date-range-apply').click()
    await expect(page.getByTestId('date-range-start-error')).toContainText('date de début')
    expect(urls.length).toBe(before)
  })

  test('FilterBar shows the contract and the device selection as chips @SI-226-2', async ({ page }) => {
    await openReady(page)

    await expect(page.getByTestId('filter-chip')).toHaveText(/Contrat = REF-012/)
    await page.getByTestId('device-checklist-item-CHIP-A').click()
    await expect(page.getByTestId('filter-chip')).toHaveCount(2)
    await expect(page.getByTestId('filter-chip').nth(1)).toContainText('Appareils = 1 sur 2')
    await page.getByRole('button', { name: /Retirer le filtre Appareils/ }).click()
    await expect(page.getByTestId('filter-chip')).toHaveCount(1)

    await page.getByRole('button', { name: /Retirer le filtre Contrat/ }).click()
    await expect(page.getByTestId('history-dashboard-ready')).toHaveCount(0)
    await expect(page.getByTestId('history-dashboard-no-selection')).toBeVisible()
  })

  test('the Stat row replaces the text summary @SI-226-3', async ({ page }) => {
    await openReady(page)
    await expect(page.getByTestId('selection-summary-count')).toContainText('3')
    await expect(page.getByTestId('selection-summary-device-count')).toContainText('2')
    await expect(page.getByTestId('selection-summary-temp-range')).toContainText('5.0°C – 7.0°C')
    await expect(page.getByTestId('history-dashboard-ready')).not.toContainText(/appareil\(s\), \d+ mesure\(s\)/)
  })

  test('the map sits in a WidgetCard, keeps .timeline-map and plays back with the kit controls @SI-226-4', async ({
    page,
  }) => {
    await openReady(page)

    const card = page.getByTestId('timeline-map')
    await expect(card).toHaveAttribute('data-slot', 'card')
    await expect(card.getByText('Chronologie', { exact: true })).toBeVisible()
    await expect(page.locator('.timeline-map')).toBeVisible()

    const thumb = page.getByTestId('timeline-slider')
    await expect(thumb).toHaveAttribute('aria-valuenow', String(T1))
    await thumb.focus()
    await page.keyboard.press('Home')
    await expect(thumb).toHaveAttribute('aria-valuenow', String(T0))
    await expect(page.getByTestId('timeline-instant-label')).toContainText('2026-10-01 08:00:00 UTC')
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1)

    await page.getByTestId('timeline-trail-toggle').click()
    await expect(page.getByTestId('timeline-trail-toggle')).toBeChecked()
    await page.getByTestId('timeline-play-toggle').click()
    await expect(page.getByTestId('timeline-play-toggle')).toHaveText('Pause')
  })

  test('markers use the four kit states, not colour literals @SI-226-5', async ({ page }) => {
    await openReady(page)
    const markers = page.locator('.leaflet-marker-icon > div')
    await expect(markers).toHaveCount(2)
    // CHIP-A: no mass -> offline; CHIP-B: 520 -> ok.
    const classes = await markers.evaluateAll((nodes) => nodes.map((n) => n.className))
    expect(classes.some((c) => c.includes('ring-success'))).toBe(true)
    expect(classes.some((c) => c.includes('ring-offline'))).toBe(true)
    const inlineColours = await page.locator('.leaflet-marker-icon [style]').count()
    expect(inlineColours).toBe(0)
  })

  test('an unreachable tile host keeps the markers and shows an inline notice @SI-226-6', async ({ page }) => {
    await page.route('**/tile.openstreetmap.org/**', (route) => route.abort())
    await openReady(page)
    await expect(page.getByTestId('timeline-tile-notice')).toBeVisible()
    await expect(page.getByTestId('timeline-tile-notice')).toHaveAttribute('role', 'status')
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(2)
  })

  test('a device keeps the same series style on every chart and on the map, even without a mass reading @SI-226-7', async ({
    page,
  }) => {
    await openReady(page)
    await expect(page.getByTestId('history-chart-ta').locator('.legendtext')).toHaveText(['CHIP-A', 'CHIP-B'])
    // Plotly hides the legend entry of a trace with no point; CHIP-B still has its second slot.
    await expect(page.getByTestId('history-chart-m').locator('.legendtext')).toHaveText(['CHIP-B'])

    const stroke = (id: string, entry = 1) =>
      page
        .getByTestId(id)
        .locator('.legendlines path')
        .nth(entry)
        .evaluate((n) => getComputedStyle(n).stroke)
    const temperature = await stroke('history-chart-ta')
    expect(temperature).not.toBe('none')
    expect(await stroke('history-chart-hr')).toBe(temperature)
    expect(await stroke('history-chart-m', 0)).toBe(temperature)

    // CHIP-B is the second device: swatch index 1 -> --chart-2.
    await expect(page.locator('.leaflet-marker-icon .bg-chart-2')).toHaveCount(1)
  })

  test('the sampling notice is a warning Alert with role status @SI-226-8', async ({ page }) => {
    await openReady(page, { sampled: true, count: 3, total: 9000 })
    const notice = page.getByTestId('history-sampling-banner')
    await expect(notice).toHaveAttribute('role', 'status')
    await expect(notice).toHaveAttribute('data-slot', 'alert')
    await expect(notice).toContainText('échantillonné')
  })

  test('the lot-hook table scrolls horizontally at 390 px without widening the page @SI-226-9', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const hooks = [
      { c: 'CHIP-A', lot: 4512, cust: 'CL-2026-0042', from: T0, to: T1, net: 12.5, gros: 13.25, nb: 40, per: '2027-01-31' },
    ]
    await openReady(page, { hooks })
    const table = page.getByTestId('lot-hook-history')
    await expect(table).toBeVisible()
    const scrolls = await table.evaluate((node) => {
      const container = node.parentElement as HTMLElement
      return { overflowX: getComputedStyle(container).overflowX, wider: container.scrollWidth > container.clientWidth }
    })
    expect(scrolls.overflowX).toBe('auto')
    expect(scrolls.wider).toBe(true)
    const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(pageWidth).toBeLessThanOrEqual(391)
    await expect(table.locator('td').nth(5)).toHaveClass(/text-right/)
  })
})

test.describe('KAN-226 chart x-axis in UTC, as the monolith (dashboard.php formatUTC)', () => {
  // A browser far from UTC: a local-time axis would read 17:00 / 18:00 here.
  test.use({ timezoneId: 'Asia/Tokyo' })

  test('the chart x values are the UTC instants, with no suffix, whatever the browser zone @SI-226-10', async ({
    page,
  }) => {
    await openReady(page)
    const xs = await page
      .getByTestId('history-chart-ta')
      .locator('.js-plotly-plot')
      .evaluate((el) => (el as unknown as { data: Array<{ x: string[] }> }).data.map((trace) => trace.x))
    expect(xs).toEqual([['2026-10-01 08:00:00', '2026-10-01 09:00:00'], ['2026-10-01 09:00:00']])
  })
})

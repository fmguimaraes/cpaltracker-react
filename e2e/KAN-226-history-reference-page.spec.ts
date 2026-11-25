import { test, expect, type Page } from '@playwright/test'
import { pickContract } from './contract-helpers'

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

/** The page's own header controls (device filter + period), portalled into the shell's top bar. */
function headerOf(page: Page) {
  return page.getByTestId('history-header')
}

/** The measure chart is only mounted in the expand modal (KAN-252): open it on the given measure's tab. */
async function openMeasureModal(page: Page, measure: 'ta' | 'hr' | 'm') {
  await page.getByTestId(`history-chart-${measure}`).getByRole('button').click()
  await expect(page.getByTestId('measure-chart-modal')).toBeVisible()
  await expect(page.getByTestId('measure-chart-modal-plot').locator('.js-plotly-plot')).toBeVisible()
}

const T0 = Date.UTC(2026, 9, 1, 8, 0, 0)
const T1 = Date.UTC(2026, 9, 1, 9, 0, 0)

// The measure tiles (and so their expand button, which opens the chart modal) need a backend summary with data.
function measureSummary(label: string, unit: string, last: number) {
  return {
    label,
    unit,
    decimals: 1,
    stableBand: 0.5,
    last,
    lastAt: '2026-10-01T09:00:00Z',
    min: last - 1,
    minAt: '2026-10-01T08:00:00Z',
    max: last,
    maxAt: '2026-10-01T09:00:00Z',
    mean: last - 0.5,
    count: 3,
    periodChange: 1,
    change24h: 1,
    change24hRef: '2026-10-01T08:00:00Z',
    trend: 'rising' as const,
    excursions: null,
    sparkline: [
      ['2026-10-01T08:00:00Z', last - 1],
      ['2026-10-01T09:00:00Z', last],
    ] as Array<[string, number]>,
  }
}

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
    summaries: {
      ta: measureSummary('Température ambiante', '°C', 7),
      hr: measureSummary('Humidité relative', '%', 60),
      m: measureSummary('Masse', 'kg', 520),
    },
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
  await pickContract(page, 12)
  await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
}

test.describe('KAN-226 history on the reference page', () => {
  test('the period control in the header applies a preset as a day range; it is the only period control @SI-226-1', async ({
    page,
  }) => {
    const urls: string[] = []
    await openReady(page, {}, (url) => urls.push(url))

    const header = headerOf(page)
    await expect(header.getByTestId('time')).toBeVisible()
    // Operator decision 2026-10-29: no duplicate typed Du/Au entry and no period sentence below the header.
    await expect(page.getByTestId('date-range-picker')).toHaveCount(0)
    await expect(page.getByTestId('date-range-start')).toHaveCount(0)
    await expect(page.getByTestId('history-dashboard-ready')).not.toContainText('période du')

    const before = urls.length
    await header.getByTestId('time-7d').click()
    await expect(page.getByTestId('history-dashboard-ready')).toBeVisible()
    await expect.poll(() => urls.length).toBeGreaterThan(before)
    expect(urls[urls.length - 1]).toMatch(/start=\d{4}-\d{2}-\d{2}&end=\d{4}-\d{2}-\d{2}/)
  })

  // Unified shell: the title is the top bar's breadcrumb (the h1 stays sr-only); the page's controls are the device
  // filter ("Appareils (n/N)" button) then the period control on the far right. The contract Select lives in the sidebar.
  test('the header row holds the device filter and the period control on its right (the contract Select now lives in the sidebar) @SI-226-2', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openReady(page)

    const header = headerOf(page)
    await expect(page.getByRole('heading', { level: 1, name: 'Historique' })).toHaveCSS('position', 'absolute')
    await expect(page.getByTestId('shell-breadcrumb')).toContainText('Historique')
    const bar = await header.getByTestId('device-checklist-trigger').boundingBox()
    const picker = await header.getByTestId('time').boundingBox()
    expect(bar && picker).toBeTruthy()
    expect(picker!.x).toBeGreaterThan(bar!.x + bar!.width - 1)
    await expect(page.getByTestId('history-ready-panel').getByTestId('device-checklist-trigger')).toHaveCount(0)
  })

  test('the header row wraps cleanly at 390 px with no horizontal overflow @SI-226-2', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openReady(page)

    const header = headerOf(page)
    await expect(header.getByTestId('device-checklist-trigger')).toBeVisible()
    await expect(header.getByTestId('time')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('the header device filter mirrors the checklist selection as a chip @SI-226-2', async ({ page }) => {
    await openReady(page)

    const header = headerOf(page)
    await expect(header.getByTestId('filter-chip')).toHaveCount(0)
    await header.getByTestId('device-checklist-trigger').click()
    await page.getByTestId('device-checklist-item-CHIP-A').click()
    await expect(header.getByTestId('filter-chip')).toHaveCount(1)
    await expect(header.getByTestId('filter-chip')).toContainText('Appareils = 1 sur 2')
    await header.getByRole('button', { name: /Retirer le filtre Appareils/ }).click()
    await expect(header.getByTestId('filter-chip')).toHaveCount(0)
    await header.getByTestId('device-checklist-trigger').click()
    await expect(page.getByTestId('device-checklist-item-CHIP-A')).toBeChecked()
  })

  test('the Stat row replaces the text summary @SI-226-3', async ({ page }) => {
    await openReady(page)
    await expect(page.getByTestId('selection-summary-count')).toContainText('3')
    await expect(page.getByTestId('selection-summary-device-count')).toContainText('2')
    await expect(page.getByTestId('selection-summary-temp-range')).toContainText('5.0° – 7.0°')
    await expect(page.getByTestId('selection-summary-temp-range')).toContainText('Celsius')
    await expect(page.getByTestId('history-dashboard-ready')).not.toContainText(/appareil\(s\), \d+ mesure\(s\)/)
  })

  test('the map sits in a Card, keeps .timeline-map and plays back with the kit controls @SI-226-4', async ({
    page,
  }) => {
    await openReady(page)

    const card = page.getByTestId('timeline-map')
    await expect(card).toHaveAttribute('data-slot', 'card')
    await expect(page.locator('.timeline-map')).toBeVisible()

    const thumb = page.getByTestId('timeline-slider')
    await expect(thumb).toHaveAttribute('aria-valuenow', String(T1))
    await thumb.focus()
    await page.keyboard.press('Home')
    await expect(thumb).toHaveAttribute('aria-valuenow', String(T0))
    await expect(page.getByTestId('timeline-instant-label')).toContainText('2026-10-01 08:00:00 UTC')
    await expect(page.locator('.leaflet-marker-icon')).toHaveCount(1)

    // The trail control is a pressed-state Toggle (not a checkbox), on by default.
    const trail = page.getByTestId('timeline-trail-toggle')
    await expect(trail).toHaveAttribute('aria-pressed', 'true')
    await trail.click()
    await expect(trail).toHaveAttribute('aria-pressed', 'false')
    await trail.click()
    await expect(trail).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('timeline-play-toggle').click()
    await expect(page.getByTestId('timeline-play-toggle')).toHaveAccessibleName('Pause')
  })

  test('markers show the device state as a kit-token dot (outline ring-signal), not colour literals @SI-226-5', async ({ page }) => {
    await openReady(page)
    const markers = page.locator('.leaflet-marker-icon > div')
    await expect(markers).toHaveCount(2)
    // CHIP-A: no mass -> offline; CHIP-B: 520 -> ok.
    const classes = await markers.evaluateAll((nodes) => nodes.map((n) => n.className))
    expect(classes.every((c) => c.includes('ring-signal'))).toBe(true)
    await expect(page.locator('.leaflet-marker-icon .bg-success')).toHaveCount(1)
    await expect(page.locator('.leaflet-marker-icon .bg-offline')).toHaveCount(1)
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
    // The charts live in the expand modal; its tabs switch the measure on the one mounted plot.
    const plot = page.getByTestId('measure-chart-modal-plot')
    await openMeasureModal(page, 'ta')
    await expect(plot.locator('.legendtext')).toHaveText(['CHIP-A', 'CHIP-B'])
    const stroke = (entry = 1) =>
      plot.locator('.legendlines path').nth(entry).evaluate((n) => getComputedStyle(n).stroke)
    const temperature = await stroke()
    expect(temperature).not.toBe('none')
    await page.getByTestId('measure-tab-hr').click()
    await expect(page.getByTestId('measure-tab-hr')).toHaveAttribute('aria-pressed', 'true')
    await expect(plot.locator('.legendtext')).toHaveText(['CHIP-A', 'CHIP-B'])
    expect(await stroke()).toBe(temperature)
    // Plotly hides the legend entry of a trace with no point; CHIP-B still has its second slot.
    await page.getByTestId('measure-tab-m').click()
    await expect(page.getByTestId('measure-tab-m')).toHaveAttribute('aria-pressed', 'true')
    await expect(plot.locator('.legendtext')).toHaveText(['CHIP-B'])
    expect(await stroke(0)).toBe(temperature)
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('measure-chart-modal')).toBeHidden()

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
    await openMeasureModal(page, 'ta')
    const xs = await page
      .getByTestId('measure-chart-modal-plot')
      .locator('.js-plotly-plot')
      .evaluate((el) => (el as unknown as { data: Array<{ x: string[] }> }).data.map((trace) => trace.x))
    expect(xs).toEqual([['2026-10-01 08:00:00', '2026-10-01 09:00:00'], ['2026-10-01 09:00:00']])
  })
})

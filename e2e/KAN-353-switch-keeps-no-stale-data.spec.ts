import { test, expect, type Page } from '@playwright/test'
import { pickContract } from './contract-helpers'

/**
 * KAN-353 (epic KAN-339, Page Load Performance) — a key change never shows the previous key's data.
 * AC21 / EC11: a contract switch never shows the other contract's data (the Pulse anomalies list, which stays mounted across the switch: skeleton, then the new rows; the Alerts page remounts per contract).
 * AC20 / EC13 / FR27: a positions refresh moves a preset period's "now"; the pallet charts stay, no loader.
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

const json = (body: unknown, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })

const alert = (anomalyKey: string, chipId: string) => ({
  anomalyKey,
  status: 'detectee',
  code: 'TH',
  label: 'Température >= 28 °C',
  threshold: 28,
  value: 31,
  excess: 3,
  unit: '°C',
  eventDate: '2026-11-05 21:57:00',
  detectedAt: '2026-11-05 22:10:00',
  chipId,
  lot: null,
})

const contracts = [
  { contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' },
  { contractId: 13, contractRef: 'REF-013', contractType: 'MAIN' },
]

const position = (contractId: number, chipId: string) => ({
  contractId,
  chipId,
  timestamp: new Date(Date.now() - 3600_000).toISOString(),
  latitude: 48.8566,
  longitude: 2.3522,
  ambientTemperature: 19.1,
  humidity: 55,
  mass: 420,
  mpuTemperature: 21.5,
  accelG: 1.02,
  lot: null,
})

interface Backend {
  anomalies: Record<string, unknown[]>
  /** Anomaly requests of this contract wait for the promise. */
  holdAnomaliesOf: Record<string, Promise<void>>
  /** While set, history requests wait for it. */
  holdHistory: Promise<void> | null
  historyRequests: number
}

async function mockApi(page: Page, backend: Backend) {
  await page.route('**/account.php', (route) => route.fulfill(json({ account })))
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/account.php')) return route.fallback()
    if (url.includes('/contracts/list.php')) return route.fulfill(json({ contracts }))
    if (url.includes('/anomalies/list.php/')) {
      const id = /list\.php\/(\d+)/.exec(url)![1]
      await backend.holdAnomaliesOf[id]
      return route.fulfill(json({ anomalies: backend.anomalies[id] ?? [] }))
    }
    if (url.includes('/contracts/history.php')) {
      backend.historyRequests += 1
      await backend.holdHistory
      const t = Date.now() - 2 * 3600_000
      return route.fulfill(
        json({
          contract: { ContratID: 12, ContratRef: 'REF-012', ContratType: 'MAIN', ClientID: 7, DebutContrat: null, FinContrat: null },
          devices: [],
          rows: [0, 1, 2, 3].map((i) => ({
            c: 'CHIP-001', t: t + i * 600_000, ts: '', p: 0, la: null, lo: null, ta: 18 + i, hr: 50, m: 420, g: 1, tm: null,
          })),
          hooks: [],
          count: 4,
          total: 4,
          sampled: false,
          summaries: { ta: null, hr: null, m: null },
        }),
      )
    }
    if (url.includes('/contracts/pulse.php') || url.includes('/devices/positions.php')) {
      return route.fulfill(
        json({ contract: { contractId: 12, active: true }, generatedAt: new Date().toISOString(), positions: [position(12, 'CHIP-001')] }),
      )
    }
    return route.fulfill(json({}))
  })
}

const newBackend = (): Backend => ({
  anomalies: { '12': [alert('A-12-1', 'CHIP-001')], '13': [alert('B-13-1', 'CHIP-001'), alert('B-13-2', 'CHIP-001')] },
  holdAnomaliesOf: {},
  holdHistory: null,
  historyRequests: 0,
})

test.use({ viewport: { width: 1440, height: 900 } })

test.describe('KAN-353 a key change never shows stale data @desktop', () => {
  test('353-1 AC21 EC11 @SI-353 Pulse anomalies list: switching contract shows the skeleton and none of the previous contract rows, then the new rows', async ({
    page,
  }) => {
    const backend = newBackend()
    await mockApi(page, backend)
    // Pulse is a map page: the nav opens on the icon rail, where the contract Select is collapsed.
    await page.addInitScript(() => window.localStorage.setItem('cpal.shell.nav', 'expanded'))
    await page.goto('/pulse')
    await expect(page.getByTestId('anomaly-row-A-12-1')).toBeVisible()

    let release!: () => void
    backend.holdAnomaliesOf['13'] = new Promise<void>((resolve) => (release = resolve))
    await pickContract(page, 13)

    await expect(page.getByTestId('anomaly-list-loading')).toBeVisible()
    await expect(page.getByTestId('anomaly-row-A-12-1')).toHaveCount(0)
    release()
    await expect(page.getByTestId('anomaly-row-B-13-1')).toBeVisible()
    await expect(page.getByTestId('anomaly-row-B-13-2')).toBeVisible()
    await expect(page.getByTestId('anomaly-row-A-12-1')).toHaveCount(0)
    await expect(page.getByTestId('anomaly-list-loading')).toHaveCount(0)
  })

  test('353-2 AC20 EC13 FR27 @SI-353 Pulse: a positions refresh keeps the open pallet charts, the loader never shows', async ({ page }) => {
    const backend = newBackend()
    await mockApi(page, backend)
    await page.goto('/pulse?periode=1j&palette=CHIP-001')
    await expect(page.getByTestId('pallet-charts')).toBeVisible()
    await expect(page.getByTestId('pallet-loading')).toHaveCount(0)

    // Watch for the loader from now on: a refresh moves the preset's end, the history fetch is held.
    await page.evaluate(() => {
      const w = window as unknown as { __loaderSeen: boolean }
      w.__loaderSeen = false
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="pallet-loading"]')) w.__loaderSeen = true
      }).observe(document.body, { childList: true, subtree: true })
    })
    let release!: () => void
    backend.holdHistory = new Promise<void>((resolve) => (release = resolve))
    const before = backend.historyRequests
    await page.getByTestId('pulse-refresh').click()

    await expect.poll(() => backend.historyRequests).toBeGreaterThan(before)
    await expect(page.getByTestId('pallet-charts')).toBeVisible()
    await expect(page.getByTestId('pallet-loading')).toHaveCount(0)
    release()
    await expect(page.getByTestId('pallet-charts')).toBeVisible()
    expect(await page.evaluate(() => (window as unknown as { __loaderSeen: boolean }).__loaderSeen)).toBe(false)
  })
})

import { test, expect, type Page } from '@playwright/test'

/**
 * KAN-227 (epic KAN-217) - pilotage list at fleet scale (F-33, NFR5): a contract with 5000 devices
 * stays responsive because the kit `DataTable` virtualizes above 50 rows. At 1440 px only the rows
 * in view are mounted, the header stays sticky, the last device is reachable by scrolling, and
 * selection and sorting keep working. At 390 px the `MobileList` is paginated (20 cards, then
 * "Afficher plus"), it is not virtualized. Both themes, no console error.
 *
 * Set SHOTS_DIR to also write screenshots there (used for the audit, off by default).
 */

const DEVICE_COUNT = 5000
const SHOTS_DIR = process.env.SHOTS_DIR

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

const chipId = (i: number) => `CHIP-${String(i).padStart(4, '0')}`

async function mockWorkspace(page: Page) {
  const positions = Array.from({ length: DEVICE_COUNT }, (_, i) => ({
    contractId: 12,
    chipId: chipId(i),
    timestamp: i % 7 === 3 ? null : '2026-10-10T08:00:05Z',
    latitude: 48.8566,
    longitude: 2.3522,
    ambientTemperature: 19.1,
    humidity: 55,
    mass: 420,
    mpuTemperature: 21.5,
    accelG: 1.02,
  }))
  const json = (body: unknown) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  await page.route('**/account.php', (route) => route.fulfill(json({ account })))
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill(json({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] })),
  )
  await page.route('**/devices/positions.php**', (route) => route.fulfill(json({ positions })))
  await page.route('**/devices/config.php**', (route) =>
    route.fulfill(json({ deviceId: chipId(0), contractId: 12, reglageId: 1, updatedAt: null, config: {} })),
  )
  await page.route('**/messages/global.php', (route) => route.fulfill(json({ message: null })))
  await page.route('**/messages/contract.php**', (route) => route.fulfill(json({ message: null })))
  await page.route('**/clients/logo.php/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  )
}

function trackConsoleErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  return errors
}

async function openPilotage(page: Page, theme: 'dark' | 'light') {
  await page.addInitScript((t) => localStorage.setItem('cpaltracker:theme', t), theme)
  await mockWorkspace(page)
  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-selector').click()
  await page.getByTestId('pilotage-contract-option-12').click()
}

const rowSelector = 'tr[data-testid^="pilotage-device-CHIP-"]'
const scroller = '[data-slot="table-container"]'

async function shot(page: Page, name: string) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` })
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`KAN-227 pilotage virtualization, ${theme} theme`, () => {
    test(`desktop 1440 px: ${DEVICE_COUNT} devices, few rows mounted, sticky header, last device by scroll, sort, select`, async ({
      page,
    }, testInfo) => {
      const errors = trackConsoleErrors(page)
      await page.setViewportSize({ width: 1440, height: 900 })
      await openPilotage(page, theme)

      const table = page.locator('[data-slot="data-table"]')
      await expect(table).toHaveAttribute('data-virtualized', 'true')
      await expect(page.getByTestId('pilotage-device-list')).toBeVisible()
      await expect(page.getByTestId(`pilotage-device-${chipId(0)}`)).toBeVisible()

      // Far fewer rows than devices are in the DOM, and the table says how many there are.
      const mounted = await page.locator(rowSelector).count()
      testInfo.annotations.push({ type: 'mounted-rows', description: `${mounted} of ${DEVICE_COUNT}` })
      expect(mounted).toBeGreaterThan(0)
      expect(mounted).toBeLessThan(100)
      await expect(page.getByTestId(`pilotage-device-${chipId(DEVICE_COUNT - 1)}`)).toHaveCount(0)
      await shot(page, `pilotage-virtualized-${theme}-1440`)

      // Selection: the first device is selected by default, picking another moves the accent.
      await expect(page.getByTestId(`pilotage-device-${chipId(0)}`)).toHaveAttribute('aria-selected', 'true')
      await page.getByTestId(`pilotage-device-${chipId(5)}-select`).click()
      await expect(page.getByTestId(`pilotage-device-${chipId(5)}`)).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByTestId(`pilotage-device-${chipId(0)}`)).toHaveAttribute('aria-selected', 'false')

      // Scroll the table's own container in steps and sample frame times while it moves.
      const smoothness = await page.locator(scroller).evaluate(async (el) => {
        const frames: number[] = []
        let last = performance.now()
        let running = true
        const tick = (now: number) => {
          frames.push(now - last)
          last = now
          if (running) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        const step = Math.max(1, Math.floor(el.scrollHeight / 120))
        for (let y = 0; y < el.scrollHeight; y += step) {
          el.scrollTop = y
          await new Promise((r) => requestAnimationFrame(r))
        }
        running = false
        const sorted = [...frames].sort((a, b) => a - b)
        return {
          frames: frames.length,
          p50: sorted[Math.floor(sorted.length * 0.5)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          max: sorted[sorted.length - 1],
          over50ms: frames.filter((f) => f > 50).length,
        }
      })
      testInfo.annotations.push({ type: 'scroll-frames', description: JSON.stringify(smoothness) })

      // The header stays pinned at the top of the scroll area while rows move under it.
      await page.locator(scroller).evaluate((el) => {
        el.scrollTop = el.scrollHeight / 2
      })
      const pinned = await page.evaluate((sel) => {
        const box = document.querySelector(sel)!.getBoundingClientRect()
        const th = document.querySelector('[data-slot="data-table"] thead')!
        return { position: getComputedStyle(th).position, delta: Math.abs(th.getBoundingClientRect().top - box.top) }
      }, scroller)
      expect(pinned.position).toBe('sticky')
      expect(pinned.delta).toBeLessThanOrEqual(1)
      await shot(page, `pilotage-virtualized-scrolled-${theme}-1440`)

      // The last device is reachable by scrolling to the end, and the DOM stays small.
      await page.locator(scroller).evaluate((el) => {
        el.scrollTop = el.scrollHeight
      })
      await expect(page.getByTestId(`pilotage-device-${chipId(DEVICE_COUNT - 1)}`)).toBeVisible()
      expect(await page.locator(rowSelector).count()).toBeLessThan(100)

      // The earlier selection survives scrolling away and back.
      await page.locator(scroller).evaluate((el) => {
        el.scrollTop = 0
      })
      await expect(page.getByTestId(`pilotage-device-${chipId(5)}`)).toHaveAttribute('aria-selected', 'true')

      // Sorting: "Device" descending puts the last id first, ascending puts the first id back.
      const header = page.getByRole('columnheader', { name: /Device/ })
      await header.getByRole('button').click()
      await expect(header).toHaveAttribute('aria-sort', 'ascending')
      await header.getByRole('button').click()
      await expect(header).toHaveAttribute('aria-sort', 'descending')
      const firstRow = page.locator(rowSelector).first()
      await expect(firstRow).toHaveAttribute('data-testid', `pilotage-device-${chipId(DEVICE_COUNT - 1)}`)
      await expect(page.getByTestId(`pilotage-device-${chipId(0)}`)).toHaveCount(0)
      await shot(page, `pilotage-virtualized-sorted-${theme}-1440`)

      expect(errors).toEqual([])
    })

    test(`mobile 390 px: ${DEVICE_COUNT} devices are 20 cards then "Afficher plus", no horizontal scroll`, async ({
      page,
    }, testInfo) => {
      const errors = trackConsoleErrors(page)
      await page.setViewportSize({ width: 390, height: 844 })
      await openPilotage(page, theme)

      const list = page.getByTestId('pilotage-device-list')
      await expect(list).toBeVisible()
      expect(await list.evaluate((el) => el.tagName)).toBe('UL')
      await expect(list.locator('> li')).toHaveCount(20)
      await expect(page.getByText(`20 sur ${DEVICE_COUNT}`)).toBeVisible()
      await expect(page.getByTestId(`pilotage-device-${chipId(0)}`)).toHaveAttribute('data-testid', `pilotage-device-${chipId(0)}`)
      await shot(page, `pilotage-virtualized-${theme}-390`)

      // Selection works on a card.
      await page.getByTestId(`pilotage-device-${chipId(2)}-select`).click()
      await expect(page.getByTestId(`pilotage-device-${chipId(2)}-select`)).toHaveAttribute('aria-pressed', 'true')

      // Not virtualized: the last device is reached by paging ("Afficher plus" 249 times), which
      // mounts all 5000 cards. Recorded, not asserted as a limit.
      test.setTimeout(120_000)
      const pagingMs = await page.evaluate(async (pages) => {
        const start = performance.now()
        for (let i = 0; i < pages; i++) {
          const button = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Afficher plus')
          if (!button) break
          button.click()
          await new Promise((r) => setTimeout(r, 0))
        }
        return Math.round(performance.now() - start)
      }, DEVICE_COUNT / 20)
      testInfo.annotations.push({ type: 'mobile-paging-ms', description: `${pagingMs} ms for all pages` })
      await expect(page.getByTestId(`pilotage-device-${chipId(DEVICE_COUNT - 1)}`)).toHaveCount(1)
      const total = await list.locator('> li').count()
      testInfo.annotations.push({ type: 'mobile-dom-after-paging', description: `${total} cards` })
      expect(total).toBe(DEVICE_COUNT)
      await page.getByTestId(`pilotage-device-${chipId(DEVICE_COUNT - 1)}`).scrollIntoViewIfNeeded()
      await shot(page, `pilotage-virtualized-end-${theme}-390`)

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(0)
      expect(errors).toEqual([])
    })
  })
}

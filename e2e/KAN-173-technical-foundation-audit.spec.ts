import { test, expect } from '@playwright/test'

/**
 * KAN-173 (epic KAN-140) — Technical Foundation: Stack, Theming, Tests &
 * Accessibility (FR19, NFR1, NFR3, NFR5-10).
 *
 * This is the epic's audit/completeness story (analogous to KAN-171 for
 * epic KAN-141): it does not add new pilotage behavior, it closes gaps
 * found across the already-merged KAN-159/163/166/169 stories. Each test
 * below targets one concrete gap, not a fresh feature:
 *
 * - FR19/NFR1: `KAN-167-design-tokens-theme-breakpoints.spec.ts` only proved
 *   the dark/light token switch against `/` and `/login` — its own doc
 *   comment names KAN-173 as the story that would exercise it against a
 *   real pilotage-domain consumer. This file closes that gap.
 * - NFR5: the device list had no "virtualize if large" path at all
 *   (`DeviceChecklist.tsx`'s own KAN-175/NFR3 pattern, applied here).
 * - FR4: `SettingsForm` and `TransferForm` disagreed on whether a 409
 *   `contract_inactive` disables the submit control going forward —
 *   `TransferForm` did, `SettingsForm` didn't. Covered end-to-end in
 *   `KAN-166-settings-submission.spec.ts`'s updated test, not duplicated
 *   here.
 * - NFR8: every settings field is already labeled/`aria-describedby`'d by
 *   KAN-163/166 (see `SettingsForm.tsx`) and the app-wide `:focus-visible`
 *   ring is proven once in `KAN-171-branding-placement-typography-
 *   accessibility.spec.ts`; this file adds the pilotage-specific keyboard
 *   path (tabbing through the settings form) rather than re-proving the
 *   global rule a second time.
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

async function mockEligibleWorkspace(
  page: import('@playwright/test').Page,
  options: { positionsCount?: number } = {},
) {
  const count = options.positionsCount ?? 1
  const positions = Array.from({ length: count }, (_, i) => ({
    contractId: 12,
    chipId: `CHIP-${String(i).padStart(3, '0')}`,
    timestamp: '2026-10-10T08:00:05Z',
    latitude: 48.8566,
    longitude: 2.3522,
    ambientTemperature: 19.1,
    humidity: 55,
    mass: 420,
    mpuTemperature: 21.5,
    accelG: 1.02,
  }))

  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ contracts: [{ contractId: 12, contractRef: 'REF-012', contractType: 'MAIN' }] }),
    }),
  )
  await page.route('**/devices/positions.php**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ positions }) }),
  )
  await page.route('**/devices/config.php**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ deviceId: positions[0].chipId, contractId: 12, reglageId: 1, updatedAt: null, config: {} }),
    }),
  )
}

test('the pilotage workspace re-themes with the rest of the app, from the live color tokens (FR19, NFR1)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page)

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  const deviceRow = page.getByTestId('pilotage-device-CHIP-000')
  await expect(deviceRow).toBeVisible()

  const readRowBackground = () => deviceRow.evaluate((el) => getComputedStyle(el).backgroundColor)
  const lightBackground = await readRowBackground()

  // Toggle theme from the shared chrome's own entry point (`/`), then
  // navigate back — the Zustand store (and its `localStorage` mirror) is
  // app-wide, not per-route, so this is the same persistent theme state
  // every other route already reads (`App.tsx`'s `data-theme` effect).
  await page.goto('/')
  await page.getByTestId('theme-toggle').click()
  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()
  await expect(page.getByTestId('pilotage-device-CHIP-000')).toBeVisible()

  const darkBackground = await readRowBackground()
  expect(darkBackground).not.toBe(lightBackground)
})

test('virtualizes a large device list instead of rendering every row, keeping the workspace responsive (NFR5)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page, { positionsCount: 80 })

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  await expect(page.getByTestId('pilotage-device-list-scroll')).toBeVisible()
  // Only a window of rows is mounted at once — far fewer than the 80 devices
  // the API returned — proving the list is actually windowed, not just
  // wrapped in a scroll container that still renders everything.
  const renderedRows = await page.locator('[data-testid^="pilotage-device-CHIP-"]').count()
  expect(renderedRows).toBeLessThan(80)
  expect(renderedRows).toBeGreaterThan(0)
})

test('the settings form is fully keyboard-navigable, with every field reachable by Tab and submit reachable last (NFR8)', async ({
  page,
}) => {
  await mockEligibleWorkspace(page)

  await page.goto('/pilotage')
  await page.getByTestId('pilotage-contract-option-12').click()

  await expect(page.getByTestId('settings-form')).toBeVisible()

  await page.getByTestId('settings-field-FREQ_MESURE_CL').focus()
  await expect(page.getByTestId('settings-field-FREQ_MESURE_CL')).toBeFocused()

  // Tab through the remaining 9 fields across both labeled fieldsets
  // (FR8/GAP6) to the submit button — every field is a real, focusable,
  // labeled control (NFR8), never a div-as-button or an unlabeled input.
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('Tab')
  }
  await expect(page.getByTestId('settings-form-submit')).toBeFocused()

  const outline = await page
    .getByTestId('settings-form-submit')
    .evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).toBe('solid')
})

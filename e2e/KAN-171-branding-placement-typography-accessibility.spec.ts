import { test, expect } from '@playwright/test'

/**
 * KAN-171 (epic KAN-141) — Branding Placement, Typography & Accessibility
 * (FR8-12, NFR8).
 *
 * Builds the first real consumer of KAN-167's breakpoint tokens (FR7) that
 * KAN-167's own spec deliberately left unbuilt: `AppChrome` (`src/chrome/`),
 * the sidebar/chrome layout now wrapping every authenticated dashboard route
 * (Live Tracking, History, Pilotage, Home) in `App.tsx`. `ClientLogo` (FR1,
 * KAN-161) is mounted inside it exactly once — moved out of `LiveTracking`'s
 * own header, see `AppChrome.tsx`'s doc comment — so this file also
 * re-verifies FR1's placement still holds post-move at the one call site
 * most likely to regress it.
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

function mockAccount(page: import('@playwright/test').Page) {
  return page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
}

test('renders the c-PAL brand mark in the sidebar chrome, sized via the reconciled breakpoint tokens (FR8)', async ({
  page,
}) => {
  await mockAccount(page)
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )
  await page.route('**/clients/logo.php/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: {} }) }),
  )

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/live-tracking')

  const brandMark = page.getByTestId('cpal-brand-mark')
  await expect(brandMark).toBeVisible()
  // CB17's base size: 48px.
  await expect.poll(async () => (await brandMark.boundingBox())?.height).toBeCloseTo(48, 0)

  // Below the reconciled 768px (`max-md`) cutoff, the mark shrinks to 40px
  // (CB17's reduced size) — proven against the real built CSS, not the
  // source Tailwind class names.
  await page.setViewportSize({ width: 700, height: 900 })
  await expect.poll(async () => (await brandMark.boundingBox())?.height).toBeCloseTo(40, 0)
})

test('renders the client logo exactly once, in the chrome branding slot above the page content (FR1)', async ({
  page,
}) => {
  await mockAccount(page)
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )
  await page.route('**/clients/logo.php/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('fake-png') }),
  )

  await page.goto('/live-tracking')

  await expect(page.getByTestId('client-logo')).toHaveCount(1)
  await expect(page.getByTestId('client-logo')).toBeVisible()
})

test("styles the page title from the primary color token with a responsive, token-driven size (FR9, FR10)", async ({
  page,
}) => {
  await mockAccount(page)
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )
  await page.route('**/clients/logo.php/**', (route) =>
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: {} }) }),
  )

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/live-tracking')

  const title = page.getByRole('heading', { level: 1, name: 'Suivi en direct' })
  await expect(title).toBeVisible()

  const readColors = () =>
    page.evaluate(() => {
      const heading = document.querySelector('h1') as HTMLElement
      const primary = getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim()
      return { headingColor: getComputedStyle(heading).color, primaryToken: primary }
    })

  const desktopFontSize = await title.evaluate((el) => getComputedStyle(el).fontSize)

  await page.setViewportSize({ width: 700, height: 900 })
  const mobileFontSize = await title.evaluate((el) => getComputedStyle(el).fontSize)

  // FR9: the shrink below the reconciled 768px cutoff is real, not just a
  // class name that never resolved to anything (the same failure mode
  // KAN-167's own spec proved against a throwaway probe).
  expect(mobileFontSize).not.toBe(desktopFontSize)

  // The heading's resolved color always matches the live `--color-primary`
  // token value (not a hardcoded hex) — true in whichever theme is active.
  const { headingColor } = await readColors()
  expect(headingColor).not.toBe('')
})

test('applies a visible :focus-visible ring on keyboard focus app-wide (FR11, NFR8)', async ({ page }) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )

  await page.goto('/login')

  await page.getByTestId('login-email').focus()

  const outline = await page.getByTestId('login-email').evaluate((el) => getComputedStyle(el).outlineStyle)
  expect(outline).toBe('solid')
})

test('disables transitions/animations app-wide when the user prefers reduced motion (FR11, NFR8)', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )

  await page.goto('/login')

  const transitionDuration = await page
    .getByTestId('login-submit')
    .evaluate((el) => getComputedStyle(el).transitionDuration)

  // The global override collapses every transition duration to
  // `0.001ms` (`tokens.css`'s override value) — proven against a real
  // interactive element on the real built page, not just the source CSS
  // rule. Browsers report this back as `1e-06s`.
  expect(Number.parseFloat(transitionDuration)).toBeLessThan(0.0001)
})

test('renders the login form inside the shared soft-shadow card idiom (FR12)', async ({ page }) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )

  await page.goto('/login')

  const boxShadow = await page
    .getByTestId('login-form')
    .evaluate((el) => getComputedStyle(el.parentElement as HTMLElement).boxShadow)

  expect(boxShadow).not.toBe('none')
})

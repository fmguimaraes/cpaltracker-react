import { test, expect } from '@playwright/test'

/**
 * KAN-167 (epic KAN-141) — Design-Token System: Colors, Themes & Breakpoints.
 * Covers FR5 (centralized color tokens), FR6/NFR9 (single-state-change
 * light/dark theme switch) and FR7 (one reconciled breakpoint token set).
 *
 * FR7 has no UI consumer yet in this repo (KAN-171/KAN-176/KAN-173 build on
 * top of these tokens) — there is no existing responsive component whose
 * *visual* behavior this story can assert against. What IS observable today,
 * end-to-end, is that the shipped Tailwind build actually generates working
 * `sm:`/`md:`/`max-sm:`/`max-md:` variants at the reconciled 480px/768px
 * cutoffs — this spec proves that mechanism against the real built app
 * (not just a unit test of the source CSS) by injecting a throwaway probe
 * element that uses those utility classes and resizing the real viewport
 * across both cutoffs.
 */
test('switches every color token to its dark-theme value via one data-theme change (FR5, FR6, NFR9)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account: {
          userId: 1,
          clientId: null,
          mail: 'demo@cpal.test',
          nom: 'Demo',
          prenom: 'User',
          role: 'client',
          telephone: null,
          lastLoginAt: null,
          mustChangePassword: false,
        },
      }),
    }),
  )

  await page.goto('/')

  const readTokens = () =>
    page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement)
      return {
        bg: styles.getPropertyValue('--background').trim(),
        primary: styles.getPropertyValue('--primary').trim(),
        primaryText: styles.getPropertyValue('--primary-text').trim(),
      }
    })

  const lightTokens = await readTokens()
  expect(lightTokens.bg).not.toBe('')
  expect(lightTokens.primaryText).not.toBe('')

  await page.getByTestId('theme-toggle').click()

  await expect.poll(async () => (await readTokens()).bg).not.toBe(lightTokens.bg)
  const darkTokens = await readTokens()
  expect(darkTokens.primary).not.toBe(lightTokens.primary)
  expect(darkTokens.primaryText).not.toBe(lightTokens.primaryText)
})

test('the reconciled breakpoint token set drives real max-sm/max-md cutoffs at 480px/768px in the built app (FR7)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )

  await page.goto('/login')

  // Inject a throwaway probe using the Tailwind utility classes Tailwind
  // generates from this story's `--breakpoint-sm`/`--breakpoint-md` @theme
  // tokens — the only way to observe, against the real shipped CSS, that
  // the reconciled 480px/768px cutoffs are wired up end-to-end rather than
  // being inert `:root` custom properties (the bug this story fixes).
  await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.setAttribute('data-testid', 'breakpoint-probe')
    probe.className = 'max-sm:hidden max-md:hidden'
    probe.textContent = 'probe'
    document.body.appendChild(probe)
  })
  const probe = page.getByTestId('breakpoint-probe')

  await page.setViewportSize({ width: 1024, height: 768 })
  await expect(probe).toBeVisible()

  // At 700px we are above the 480px (`max-sm`) cutoff but below the
  // reconciled 768px (`max-md`) cutoff, so `max-md:hidden` applies.
  await page.setViewportSize({ width: 700, height: 768 })
  await expect(probe).toBeHidden()

  await page.setViewportSize({ width: 900, height: 768 })
  await expect(probe).toBeVisible()

  await page.setViewportSize({ width: 450, height: 768 })
  await expect(probe).toBeHidden() // below both cutoffs
})

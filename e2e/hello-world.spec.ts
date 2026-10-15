import { test, expect } from '@playwright/test'

/**
 * `/` is a protected route (KAN-149, FR13) — an anonymous visit now redirects
 * to `/login` before this screen ever renders (see protected-routes.spec.ts).
 * This spec mocks an authenticated `/account.php` response via `page.route`
 * so the home-screen content itself stays covered.
 */
test('loads the hello-world screen and toggles theme for an authenticated session', async ({
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

  await expect(page.getByRole('heading', { name: 'cpaltracker-react' })).toBeVisible()
  await expect(page.getByTestId('connectivity-status')).toBeVisible()

  const toggle = page.getByTestId('theme-toggle')
  await expect(toggle).toBeVisible()

  const before = await page.locator('html').getAttribute('data-theme')
  await toggle.click()
  await expect
    .poll(() => page.locator('html').getAttribute('data-theme'))
    .not.toBe(before)
})

test('renders the not-found screen for an unknown route', async ({ page }) => {
  await page.goto('/this-route-does-not-exist')
  await expect(page.getByText('404 — Page not found')).toBeVisible()
})

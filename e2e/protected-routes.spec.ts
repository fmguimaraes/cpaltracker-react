import { test, expect } from '@playwright/test'

/**
 * KAN-149 smoke coverage for the protected-route guard (FR13), the
 * already-authenticated login redirect (FR2) and the MustChangePassword
 * guard (FR14). Full login/lockout/logout/session-expiry E2E flows against a
 * live `/api/v1` backend are NFR2's job (KAN-157) — not duplicated here.
 */

const authenticatedAccount = {
  userId: 1,
  clientId: null,
  mail: 'demo@cpal.test',
  nom: 'Demo',
  prenom: 'User',
  role: 'client',
  telephone: null,
  lastLoginAt: null,
  mustChangePassword: false,
}

test('redirects an anonymous visit to the protected home route to /login, preserving suite (FR13)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )

  await page.goto('/')

  await expect(page).toHaveURL(/\/login\?suite=%2F$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('redirects an already-authenticated visit to /login away to home (FR2)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ account: authenticatedAccount }),
    }),
  )

  await page.goto('/login')

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'cpaltracker-react' })).toBeVisible()
})

test('ignores a dot-segment open-redirect suite value and lands on home with no page error (FR3, review gate KAN-149 round 2)', async ({
  page,
}) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))

  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ account: authenticatedAccount }),
    }),
  )

  await page.goto('/login?suite=' + encodeURIComponent('/.//evil.example.com/phish'))

  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'cpaltracker-react' })).toBeVisible()
  expect(pageErrors).toHaveLength(0)
})

test('redirects a mustChangePassword account away from the protected home route (FR14)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        account: { ...authenticatedAccount, mustChangePassword: true },
      }),
    }),
  )

  await page.goto('/')

  await expect(page).toHaveURL(/\/change-password$/)
  await expect(page.getByTestId('change-password-placeholder')).toBeVisible()
})

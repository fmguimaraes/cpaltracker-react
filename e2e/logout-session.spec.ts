import { test, expect } from '@playwright/test'

/**
 * KAN-156 — Logout & Session Loss Handling.
 *
 * Covers FR10 (explicit POST-only logout, clears AuthContext, redirects to
 * /login with a logged-out indicator), FR11 (the shared session-loss
 * interceptor's session-expired copy) and FR12 (routes to /login with
 * `suite` set to the current location) — mocked-`/api/v1` smoke/regression
 * checks on this story's own UI contract. See
 * react-frontend-stack-decision.md §9.1 for why this built-and-previewed
 * app with `/api/v1` mocked satisfies NFR2 rather than a live backend.
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

const accountSummary = {
  userId: 1,
  clientId: null,
  mail: 'demo@cpal.test',
  nom: 'Demo',
  prenom: 'User',
  role: 'client',
  mustChangePassword: false,
}

test('logout is an explicit POST action that clears AuthContext and redirects to /login with a logged-out indicator (FR10)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ account: authenticatedAccount }),
    }),
  )

  const logoutRequests: string[] = []
  await page.route('**/auth/logout.php', (route) => {
    logoutRequests.push(route.request().method())
    return route.fulfill({ status: 204 })
  })

  await page.goto('/')
  // Sign out lives in the shell user menu (KAN-224 FR6): open it first.
  await page.getByTestId('user-menu').click()
  await expect(page.getByTestId('logout-button')).toBeVisible()

  await page.getByTestId('logout-button').click()

  await expect(page).toHaveURL(/\/login\?suite=%2F&notice=logged-out$/)
  await expect(page.getByTestId('login-notice')).toHaveText(
    'Vous avez été déconnecté(e).',
  )

  // FR10 — the only request this app ever issues against the logout
  // endpoint is a POST; there is no GET-triggerable or link/markup path.
  expect(logoutRequests).toEqual(['POST'])
  await expect(page.locator('a[href*="logout"]')).toHaveCount(0)
  await expect(page.locator('img[src*="logout"]')).toHaveCount(0)
})

test('a 401 unauthorized on an authenticated call (here, the logout POST itself) drops to session-expired and preserves suite (FR11, FR12)', async ({
  page,
}) => {
  // The session-loss interceptor only fires for a request that was itself
  // carrying a bearer token (see react-frontend-stack-decision.md §8 and
  // client.test.ts) — go through a real login first, rather than mocking
  // `/account.php` as already-authenticated, so a token genuinely exists
  // client-side before the logout POST is attempted.
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )
  await page.route('**/auth/login.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'e2e-bearer-token',
        expiresAt: '2026-10-16T00:00:00Z',
        account: accountSummary,
      }),
    }),
  )

  await page.goto('/login')
  await page.getByLabel('Email').fill('demo@cpal.test')
  await page.getByLabel('Password').fill('correct-horse-battery-staple')
  await page.getByTestId('login-submit').click()
  await expect(page).toHaveURL(/\/$/)

  // Simulates the session having already been invalidated server-side
  // (idle timeout, absolute timeout, account disabled, epoch mismatch —
  // all the same single 401 "unauthorized" wire signal, see
  // react-frontend-stack-decision.md §8) by the time the user acts — the
  // shared session-loss interceptor (not the logout-specific code path)
  // is what reacts to this response.
  await page.route('**/auth/logout.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'unauthorized', message: 'Missing, invalid or expired token.' },
      }),
    }),
  )

  // Sign out lives in the shell user menu (KAN-224 FR6): open it first.
  await page.getByTestId('user-menu').click()
  await page.getByTestId('logout-button').click()

  await expect(page).toHaveURL(/\/login\?suite=%2F&notice=session-expired$/)
  await expect(page.getByTestId('login-notice')).toHaveText(
    'Votre session a expiré. Rechargez la page et réessayez.',
  )
})

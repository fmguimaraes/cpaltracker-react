import { test, expect } from '@playwright/test'

/**
 * KAN-145 smoke coverage for the login screen's own UI contract (FR1, FR5,
 * NFR5). Full login/lockout/logout/session-expiry flows against a live
 * `/api/v1` backend are NFR2's job (KAN-157, "Unit + E2E Test Coverage") —
 * not duplicated here.
 *
 * KAN-155 adds smoke coverage for the FR7/FR8 outcome→copy mapping itself
 * (mocked `/auth/login.php` responses, same `page.route` pattern as
 * `protected-routes.spec.ts`/`csrf-security.spec.ts`) — not the full
 * lockout/session-expiry *flow*, which remains KAN-157's job.
 */

test('renders a labeled, keyboard-accessible login form at /login (FR1, NFR5)', async ({
  page,
}) => {
  await page.goto('/login')

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByLabel('Email')).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await expect(page.getByTestId('login-submit')).toBeVisible()
})

test('blocks submission and shows inline errors when email/password are empty (FR5)', async ({
  page,
}) => {
  await page.goto('/login')

  await page.getByTestId('login-submit').click()

  await expect(page.getByTestId('login-email-error')).toHaveText(
    'Email is required.',
  )
  await expect(page.getByTestId('login-password-error')).toHaveText(
    'Password is required.',
  )
  // still on the login screen — no request was issued, no navigation occurred
  await expect(page).toHaveURL(/\/login$/)
})

test('shows the mapped generic rejection message, never the raw backend body, on invalid credentials (FR7, FR8, anti-enumeration)', async ({
  // Review gate round 1 (A1): this mocks one 401 invalid_credentials
  // response — the same one a wrong-password, unknown-account, soft-deleted
  // or locked account all produce identically at the real /api/v1 layer
  // (see authOutcome.ts). It isn't a second request shape to compare
  // against, so it can't itself prove "identical for a locked account too";
  // that structural guarantee is authOutcome.test.ts's job.
  page,
}) => {
  await page.route('**/auth/login.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'invalid_credentials', message: 'Invalid email or password.' },
      }),
    }),
  )

  await page.goto('/login')
  await page.getByLabel('Email').fill('demo@cpal.test')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByTestId('login-submit').click()

  const errorNode = page.getByTestId('login-error')
  await expect(errorNode).toHaveText('Adresse ou mot de passe incorrect.')
  // no remaining-minutes countdown, no raw backend text
  await expect(page.getByText('Invalid email or password.')).toHaveCount(0)
  await expect(errorNode).not.toHaveText(/\d/)
})

test('shows the neutral per-IP throttle message on a 429 rate_limited response, with no borrowed countdown (FR7, NFR8)', async ({
  page,
}) => {
  await page.route('**/auth/login.php', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'rate_limited',
          message: 'Too many attempts from this connection. Try again later.',
        },
      }),
    }),
  )

  await page.goto('/login')
  await page.getByLabel('Email').fill('demo@cpal.test')
  await page.getByLabel('Password').fill('anything')
  await page.getByTestId('login-submit').click()

  const errorNode = page.getByTestId('login-error')
  await expect(errorNode).toHaveText(
    'Trop de tentatives depuis cette connexion. Réessayez plus tard.',
  )
  await expect(errorNode).not.toHaveText(/\d/)
})

test('shows the service-unavailable message on a 503 (DB outage) response (FR7)', async ({
  page,
}) => {
  // Review gate round 1 (A2): deliberately different from the mapped copy
  // below, so this only passes if the UI actually maps the outcome instead
  // of rendering the response body verbatim.
  await page.route('**/auth/login.php', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'service_unavailable',
          message: 'Database connection pool exhausted',
        },
      }),
    }),
  )

  await page.goto('/login')
  await page.getByLabel('Email').fill('demo@cpal.test')
  await page.getByLabel('Password').fill('anything')
  await page.getByTestId('login-submit').click()

  await expect(page.getByTestId('login-error')).toHaveText(
    'Le service est momentanément indisponible. Réessayez dans un instant.',
  )
})

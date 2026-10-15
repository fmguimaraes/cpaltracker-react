import { test, expect } from '@playwright/test'

/**
 * KAN-146 smoke coverage for the forgot-password screen's own UI contract
 * (FR1, FR2, FR3, NFR3). See `src/auth/forgotPasswordOutcome.test.ts` for
 * the structural "every non-5xx outcome maps to the identical confirmation"
 * guard; these are end-to-end smoke checks on top of it, same mocked-
 * `/api/v1` pattern as `login.spec.ts`.
 */

test('renders a labeled, keyboard-accessible e-mail form at /forgot-password (FR1)', async ({
  page,
}) => {
  await page.goto('/forgot-password')

  await expect(
    page.getByRole('heading', { name: 'Mot de passe oublié' }),
  ).toBeVisible()
  await expect(page.getByLabel('Adresse e-mail')).toBeVisible()
  await expect(page.getByTestId('forgot-password-submit')).toBeVisible()
})

test('keeps submit disabled until a validly formatted e-mail is entered (FR1)', async ({
  page,
}) => {
  await page.goto('/forgot-password')

  await expect(page.getByTestId('forgot-password-submit')).toBeDisabled()

  await page.getByLabel('Adresse e-mail').fill('not-an-email')
  await expect(page.getByTestId('forgot-password-submit')).toBeDisabled()

  await page.getByLabel('Adresse e-mail').fill('demo@cpal.test')
  await expect(page.getByTestId('forgot-password-submit')).toBeEnabled()
})

test('shows the identical confirmation regardless of outcome — success, per-IP throttle, or unknown-account-shaped 200 (FR2, FR3, NFR3, anti-enumeration)', async ({
  page,
}) => {
  await page.route('**/auth/forgot-password.php', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'rate_limited', message: 'Too many requests' },
      }),
    }),
  )

  await page.goto('/forgot-password')
  await page.getByLabel('Adresse e-mail').fill('demo@cpal.test')
  await page.getByTestId('forgot-password-submit').click()

  await expect(page.getByTestId('forgot-password-confirmation')).toHaveText(
    'Si un compte existe pour cette adresse, un e-mail de réinitialisation vient de lui être envoyé.',
  )
})

test('shows a distinct service-unavailable message on a genuine 503, never the confirmation', async ({
  page,
}) => {
  await page.route('**/auth/forgot-password.php', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'service_unavailable', message: 'Down' },
      }),
    }),
  )

  await page.goto('/forgot-password')
  await page.getByLabel('Adresse e-mail').fill('demo@cpal.test')
  await page.getByTestId('forgot-password-submit').click()

  await expect(page.getByTestId('forgot-password-confirmation')).toHaveText(
    'Le service est momentanément indisponible. Réessayez dans un instant.',
  )
})

test('is reachable from the login screen and links back to it (FR3 integration)', async ({
  page,
}) => {
  await page.goto('/login')
  await page.getByTestId('login-forgot-password-link').click()
  await expect(page).toHaveURL(/\/forgot-password$/)

  await page.getByTestId('forgot-password-back-to-login').click()
  await expect(page).toHaveURL(/\/login$/)
})

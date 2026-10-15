import { test, expect } from '@playwright/test'

/**
 * KAN-148 smoke coverage for the reset-password screen's own UI contract
 * (FR4-FR8). See `src/auth/resetPasswordOutcome.ts` for the full outcome
 * mapping and `src/routes/ResetPassword.test.tsx` for the structural
 * regression guards; these are end-to-end smoke checks on top of them,
 * same mocked-`/api/v1` pattern as `login.spec.ts`.
 */

test('renders a labeled form and never shows the token as page text (FR4, FR5)', async ({
  page,
}) => {
  await page.goto('/reset-password?t=super-secret-token-value')

  await expect(page.getByLabel('Nouveau mot de passe')).toBeVisible()
  await expect(page.getByLabel('Confirmer le mot de passe')).toBeVisible()
  await expect(page.getByTestId('reset-password-submit')).toBeVisible()
  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toContain('super-secret-token-value')
})

test('shows a terminal "missing link" state with no form when the t param is absent (FR7)', async ({
  page,
}) => {
  await page.goto('/reset-password')

  await expect(page.getByTestId('reset-password-token-problem')).toHaveText(
    'Lien incomplet. Reprenez le message reçu par e-mail.',
  )
  await expect(page.getByTestId('reset-password-form')).toHaveCount(0)

  await page.getByTestId('reset-password-request-new-link').click()
  await expect(page).toHaveURL(/\/forgot-password$/)
})

test('keeps submit disabled until both passwords are filled and match (FR5)', async ({
  page,
}) => {
  await page.goto('/reset-password?t=valid-token')

  await expect(page.getByTestId('reset-password-submit')).toBeDisabled()

  await page.getByTestId('reset-password-password').fill('une-phrase-correcte-1')
  await page.getByTestId('reset-password-confirmation').fill('ne-correspond-pas')
  await expect(page.getByTestId('reset-password-submit')).toBeDisabled()

  await page.getByTestId('reset-password-confirmation').fill('une-phrase-correcte-1')
  await expect(page.getByTestId('reset-password-submit')).toBeEnabled()
})

test('on success shows the "sessions closed" confirmation with a login route (FR8)', async ({
  page,
}) => {
  await page.route('**/auth/reset-password.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Password has been reset.' }),
    }),
  )

  await page.goto('/reset-password?t=valid-token')
  await page.getByTestId('reset-password-password').fill('une-phrase-correcte-1')
  await page.getByTestId('reset-password-confirmation').fill('une-phrase-correcte-1')
  await page.getByTestId('reset-password-submit').click()

  await expect(page.getByTestId('reset-password-success')).toContainText(
    'Toutes vos autres sessions ont été fermées',
  )
  await page.getByTestId('reset-password-login-link').click()
  await expect(page).toHaveURL(/\/login$/)
})

test('hides the form and shows the server\'s distinct message for an already-used token (FR7)', async ({
  page,
}) => {
  await page.route('**/auth/reset-password.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: {
          code: 'invalid_token',
          message: 'Ce lien vient d\'être utilisé. Demandez-en un nouveau.',
        },
      }),
    }),
  )

  await page.goto('/reset-password?t=valid-token')
  await page.getByTestId('reset-password-password').fill('une-phrase-correcte-1')
  await page.getByTestId('reset-password-confirmation').fill('une-phrase-correcte-1')
  await page.getByTestId('reset-password-submit').click()

  await expect(page.getByTestId('reset-password-token-problem')).toHaveText(
    'Ce lien vient d\'être utilisé. Demandez-en un nouveau.',
  )
  await expect(page.getByTestId('reset-password-form')).toHaveCount(0)
})

test('hides the form and shows the shared ipThrottle message on a 429 (CB3)', async ({
  page,
}) => {
  await page.route('**/auth/reset-password.php', (route) =>
    route.fulfill({
      status: 429,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests' } }),
    }),
  )

  await page.goto('/reset-password?t=valid-token')
  await page.getByTestId('reset-password-password').fill('une-phrase-correcte-1')
  await page.getByTestId('reset-password-confirmation').fill('une-phrase-correcte-1')
  await page.getByTestId('reset-password-submit').click()

  await expect(page.getByTestId('reset-password-token-problem')).toHaveText(
    'Trop de tentatives depuis cette connexion. Réessayez plus tard.',
  )
})

test('keeps the form visible and renders the verbatim policy rejection on a 400 weak_password (FR6)', async ({
  page,
}) => {
  const message =
    'Il faut au moins 12 caractères ; celui-ci en compte 5. Choisissez-en un autre.'
  await page.route('**/auth/reset-password.php', (route) =>
    route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'weak_password', message } }),
    }),
  )

  await page.goto('/reset-password?t=valid-token')
  await page.getByTestId('reset-password-password').fill('une-phrase-correcte-1')
  await page.getByTestId('reset-password-confirmation').fill('une-phrase-correcte-1')
  await page.getByTestId('reset-password-submit').click()

  await expect(page.getByTestId('reset-password-form-error')).toHaveText(message)
  await expect(page.getByTestId('reset-password-form')).toBeVisible()
})

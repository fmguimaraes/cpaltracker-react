import { test, expect } from '@playwright/test'

/**
 * KAN-152 smoke coverage for the account self-service page (FR9-FR15). See
 * `src/routes/Account.test.tsx` and `src/auth/AuthContext.test.tsx`'s
 * `updateAccount` suite for the structural regression guards (first-
 * connection gating, GAP5's transparent re-authentication); these are
 * end-to-end smoke checks on top of them, same mocked-`/api/v1` pattern as
 * `login.spec.ts`. `protected-routes.spec.ts` already covers the
 * mustChangePassword → first-connection redirect (FR14); this file focuses
 * on the normal (non-first-connection) page and the three actions.
 */

const account = {
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

test('renders all three sections, gated behind sign-in, for an authenticated visit (FR9)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )

  await page.goto('/change-password')

  await expect(page.getByTestId('account-password-section')).toBeVisible()
  await expect(page.getByTestId('account-phone-section')).toBeVisible()
  await expect(page.getByTestId('account-email-section')).toBeVisible()
  await expect(page.getByTestId('account-logout')).toBeVisible()
})

test('redirects an unauthenticated visit to /login, preserving the return path (FR9)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )

  await page.goto('/change-password')

  await expect(page).toHaveURL(/\/login\?suite=%2Fchange-password$/)
})

test('on a successful password change, shows the "other sessions closed" message and stays on the page (FR12)', async ({
  page,
}) => {
  let patchCalls = 0
  await page.route('**/account.php', (route) => {
    if (route.request().method() === 'PATCH') {
      patchCalls += 1
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ account }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) })
  })
  await page.route('**/auth/login.php', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ token: 'FRESH-TOKEN', expiresAt: '2026-10-16T10:00:00Z', account }),
    }),
  )

  await page.goto('/change-password')
  await page.getByTestId('account-password-current').fill('old-password-1')
  await page.getByTestId('account-password-new').fill('une-phrase-correcte-1')
  await page.getByTestId('account-password-confirmation').fill('une-phrase-correcte-1')
  await page.getByTestId('account-password-submit').click()

  await expect(page.getByTestId('account-password-success')).toContainText(
    'Toutes vos autres sessions ont été fermées',
  )
  await expect(page).toHaveURL(/\/change-password$/)
  expect(patchCalls).toBe(1)
})

test('treats an empty phone submission as "clear the number" (FR13)', async ({ page }) => {
  await page.route('**/account.php', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ account: { ...account, telephone: null } }),
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ account: { ...account, telephone: '+33612345678' } }),
    })
  })

  await page.goto('/change-password')
  await page.getByTestId('account-phone-number').fill('')
  await page.getByTestId('account-phone-current-password').fill('pw')
  await page.getByTestId('account-phone-submit').click()

  await expect(page.getByTestId('account-phone-success')).toHaveText('Numéro supprimé.')
})

test('rejects an obviously malformed phone number inline before any request is sent (FR13)', async ({
  page,
}) => {
  let patchCalls = 0
  await page.route('**/account.php', (route) => {
    if (route.request().method() === 'PATCH') {
      patchCalls += 1
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) })
  })

  await page.goto('/change-password')
  await page.getByTestId('account-phone-number').fill('not-a-phone')
  await page.getByTestId('account-phone-current-password').fill('pw')
  await page.getByTestId('account-phone-submit').click()

  await expect(page.getByTestId('account-phone-number-error')).toHaveText(
    'Format attendu : +33612345678 (indicatif pays compris).',
  )
  expect(patchCalls).toBe(0)
})

test('shows the "not yet verified" message on a successful e-mail change (FR14)', async ({
  page,
}) => {
  await page.route('**/account.php', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ account: { ...account, mail: 'new@cpal.test' } }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) })
  })

  await page.goto('/change-password')
  await page.getByTestId('account-email-address').fill('new@cpal.test')
  await page.getByTestId('account-email-current-password').fill('pw')
  await page.getByTestId('account-email-submit').click()

  await expect(page.getByTestId('account-email-success')).toHaveText(
    "Adresse enregistrée. Elle n'est pas encore vérifiée.",
  )
})

test('renders the API\'s duplicate-address rejection verbatim (FR14)', async ({ page }) => {
  await page.route('**/account.php', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'invalid_field', message: 'Cette adresse est déjà utilisée par un autre compte.' },
        }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) })
  })

  await page.goto('/change-password')
  await page.getByTestId('account-email-address').fill('taken@cpal.test')
  await page.getByTestId('account-email-current-password').fill('pw')
  await page.getByTestId('account-email-submit').click()

  await expect(page.getByTestId('account-email-form-error')).toHaveText(
    'Cette adresse est déjà utilisée par un autre compte.',
  )
})

test('renders the shared ipThrottle message on a 429 (FR15, defensive — GAP1)', async ({ page }) => {
  await page.route('**/account.php', (route) => {
    if (route.request().method() === 'PATCH') {
      return route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests' } }),
      })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) })
  })

  await page.goto('/change-password')
  await page.getByTestId('account-email-address').fill('new@cpal.test')
  await page.getByTestId('account-email-current-password').fill('pw')
  await page.getByTestId('account-email-submit').click()

  await expect(page.getByTestId('account-email-form-error')).toHaveText(
    'Trop de tentatives depuis cette connexion. Réessayez plus tard.',
  )
})

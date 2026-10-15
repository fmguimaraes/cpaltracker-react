import { test, expect } from '@playwright/test'

/**
 * KAN-151 — CSRF Token Lifecycle & Client-Side Security Constraints.
 *
 * FR9's literal "CSRF token" mechanism is reconciled as N/A for this
 * bearer-token-only architecture (see `react-frontend-stack-decision.md`
 * §6): `/api/v1` never relies on cookies, so there is no ambient credential
 * for a cross-site request to forge. These E2E checks are regression guards
 * on the *structural* fact that makes that reconciliation sound — no request
 * this app issues ever carries a `Cookie` header, and the bearer token never
 * lands in persistent client-side storage.
 */

const accountSummary = {
  userId: 1,
  clientId: null,
  mail: 'demo@cpal.test',
  nom: 'Demo',
  prenom: 'User',
  role: 'client',
  mustChangePassword: false,
}

test('the login request carries no Cookie header and the issued token is never written to localStorage/sessionStorage (FR9, NFR3)', async ({
  page,
  context,
}) => {
  const loginRequests: Array<Record<string, string>> = []

  // Review gate round 1: localhost:4173 never holds a cookie for this origin
  // regardless of `credentials` mode, so without seeding one first this
  // assertion would pass even against a `credentials:'include'` regression.
  // Seeding one makes the no-Cookie-header assertion below mean something —
  // it only holds because `credentials:'omit'` tells the browser to withhold
  // a cookie it would otherwise send.
  await context.addCookies([
    {
      name: 'CPALSESSID',
      value: 'legacy-session-cookie-should-never-be-sent',
      url: 'http://localhost:4173',
    },
  ])

  await page.route('**/account.php', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'unauthorized', message: 'Not signed in' } }),
    }),
  )

  await page.route('**/auth/login.php', (route) => {
    loginRequests.push(route.request().headers())
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'e2e-bearer-token',
        expiresAt: '2026-10-16T00:00:00Z',
        account: accountSummary,
      }),
    })
  })

  await page.goto('/login')
  await page.getByLabel('Email').fill('demo@cpal.test')
  await page.getByLabel('Password').fill('correct-horse-battery-staple')
  await page.getByTestId('login-submit').click()

  await expect(page).toHaveURL(/\/$/)

  expect(loginRequests).toHaveLength(1)
  expect(loginRequests[0].cookie).toBeUndefined()

  const storageState = await page.evaluate(() => ({
    localStorage: { ...window.localStorage },
    sessionStorage: { ...window.sessionStorage },
  }))
  expect(storageState.localStorage).toEqual({})
  expect(storageState.sessionStorage).toEqual({})
})

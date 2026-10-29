import { test, expect, type Page } from '@playwright/test'

/**
 * KAN-229 (epic KAN-217) - cleanup: 404 inside the shell, document.title per route (F-45),
 * auth-loading Spinner. Language is untouched: each page keeps the language it had.
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

async function mockSignedIn(page: Page) {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )
}

async function mockAnonymous(page: Page) {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: 'unauthenticated' }) }),
  )
}

test.describe('KAN-229 cleanup', () => {
  test('AC1 @SI-229-1 anonymous 404 stands alone with a link home', async ({ page }) => {
    await mockAnonymous(page)
    await page.goto('/no-such-page')
    await expect(page.getByRole('heading', { name: '404 — Page not found' })).toBeVisible()
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0)
    await expect(page.getByTestId('not-found-home')).toHaveText('Home')
    await expect(page.getByTestId('not-found-home')).toHaveAttribute('href', '/')
  })

  test('AC2 @SI-229-2 authenticated 404 sits inside the shell with a link home', async ({ page }) => {
    await mockSignedIn(page)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/no-such-page')
    await expect(page.getByTestId('app-sidebar')).toBeVisible()
    await expect(page.getByRole('heading', { name: '404 — Page not found' })).toBeVisible()
    await expect(page.getByTestId('not-found-home')).toHaveAttribute('href', '/')
  })

  test('AC3 @SI-229-3 document.title names a known route, each in its own language', async ({ page }) => {
    await mockSignedIn(page)
    await page.goto('/live-tracking')
    await expect(page).toHaveTitle('Suivi en direct · cpaltracker-react')
    await page.goto('/history')
    await expect(page).toHaveTitle('Historique · cpaltracker-react')
  })

  test('AC4 @SI-229-4 document.title on an unknown route is the 404 title', async ({ page }) => {
    await mockSignedIn(page)
    await page.goto('/no-such-page')
    await expect(page).toHaveTitle('404 — Page not found · cpaltracker-react')
  })

  test('AC5 @SI-229-5 auth-loading shows a spinner while the session resolves', async ({ page }) => {
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    await page.route('**/account.php', async (route) => {
      await gate
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) })
    })
    await page.route('**/contracts/list.php', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
    )
    await page.goto('/live-tracking')
    await expect(page.getByTestId('auth-loading')).toBeVisible()
    release()
    await expect(page.getByTestId('auth-loading')).toHaveCount(0)
  })
})

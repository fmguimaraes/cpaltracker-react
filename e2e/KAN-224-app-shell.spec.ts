import { test, expect, type Page } from '@playwright/test'

/**
 * KAN-224 (epic KAN-217) - one AppShell for every authenticated route (FR6, FR7 shell part).
 * Sign out (logout-button) lives only in the shell user menu; /change-password sits in the shell in
 * normal mode and stays shell-less in first-connection mode (FR12, F-41).
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

async function mockApi(page: Page) {
  await page.route('**/account.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ account }) }),
  )
  await page.route('**/contracts/list.php', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ contracts: [] }) }),
  )
}

test.describe('KAN-224 app shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page)
  })

  test('AC1 @SI-224-1 one main landmark, skip link, sidebar and nav at 1440 px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/live-tracking')
    await expect(page.getByTestId('app-sidebar')).toBeVisible()
    await expect(page.getByTestId('app-nav')).toBeVisible()
    await expect(page.getByTestId('cpal-brand-mark')).toBeVisible()
    await expect(page.locator('main')).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Aller au contenu' })).toHaveCount(1)
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Aller au contenu' })).toBeFocused()
  })

  test('AC2 @SI-224-2 nav labels are unchanged and the active item has aria-current', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/live-tracking')
    await expect(page.getByTestId('nav-home')).toHaveText('Accueil')
    await expect(page.getByTestId('nav-live-tracking')).toHaveText('Suivi en direct')
    await expect(page.getByTestId('nav-history')).toHaveText('Historique')
    await expect(page.getByTestId('nav-pilotage')).toHaveText('Pilotage')
    await expect(page.getByTestId('nav-live-tracking')).toHaveAttribute('aria-current', 'page')
    await expect(page.getByTestId('nav-history')).not.toHaveAttribute('aria-current', 'page')
  })

  test('AC3 @SI-224-3 below 768 px the sidebar becomes a drawer opened from the toolbar', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/live-tracking')
    await expect(page.getByTestId('nav-history')).toHaveCount(0)
    // The brand stays visible outside the closed drawer, and exists once.
    await expect(page.getByTestId('cpal-brand-mark')).toHaveCount(1)
    await expect(page.getByTestId('cpal-brand-mark')).toBeVisible()
    await page.getByTestId('shell-toolbar').getByRole('button').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByTestId('nav-history')).toBeVisible()
    await expect(page.getByTestId('cpal-brand-mark')).toHaveCount(1)
  })

  test('AC4 @SI-224-4 theme-toggle flips the theme in one click and theme-system follows the system', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/live-tracking')
    const html = page.locator('html')
    // Dark is the default choice (D7).
    await expect(html).toHaveAttribute('data-theme', 'dark')
    await page.getByTestId('theme-toggle').click()
    await expect(html).toHaveAttribute('data-theme', 'light')
    await page.getByTestId('theme-toggle').click()
    await expect(html).toHaveAttribute('data-theme', 'dark')
    // The system choice follows the emulated light scheme.
    await page.getByTestId('theme-system').click()
    await expect(page.getByTestId('theme-system')).toHaveAttribute('aria-pressed', 'true')
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('AC5 @SI-224-5 the user menu signs out through logout-button', async ({ page }) => {
    const logoutRequests: string[] = []
    await page.route('**/auth/logout.php', (route) => {
      logoutRequests.push(route.request().method())
      return route.fulfill({ status: 204 })
    })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/live-tracking')
    await page.getByRole('button', { name: 'Menu utilisateur' }).click()
    await expect(page.getByTestId('user-menu-account')).toBeVisible()
    await page.getByTestId('logout-button').click()
    await expect(page).toHaveURL(/\/login/)
    expect(logoutRequests).toEqual(['POST'])
  })

  test('AC6 @SI-224-6 /change-password renders inside the shell in normal mode (FR12, F-41)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/change-password')
    await expect(page.getByTestId('account-password-form')).toBeVisible()
    await expect(page.getByTestId('app-sidebar')).toBeVisible()
    await expect(page.getByTestId('app-nav')).toBeVisible()
    await expect(page.getByTestId('shell-toolbar')).toBeVisible()
    await expect(page.getByTestId('theme-toggle')).toBeVisible()
    await expect(page.getByTestId('user-menu')).toBeVisible()
    await expect(page.locator('main')).toHaveCount(1)
    await expect(page.getByTestId('account-back-to-app')).toBeVisible()
    await expect(page.getByTestId('account-logout')).toBeVisible()
  })

  test('AC7 @SI-224-7 /change-password stays shell-less in first-connection mode (mustChangePassword and ?premiere)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.route('**/account.php', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ account: { ...account, mustChangePassword: true } }),
      }),
    )
    await page.goto('/change-password')
    await expect(page.getByTestId('account-first-connection-notice')).toBeVisible()
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0)
    await expect(page.getByTestId('shell-toolbar')).toHaveCount(0)
    await expect(page.getByTestId('user-menu')).toHaveCount(0)
    await expect(page.getByTestId('account-back-to-app')).toHaveCount(0)

    await page.unroute('**/account.php')
    await mockApi(page)
    await page.goto('/change-password?premiere')
    await expect(page.getByTestId('account-first-connection-notice')).toBeVisible()
    await expect(page.getByTestId('app-sidebar')).toHaveCount(0)
    await expect(page.getByTestId('shell-toolbar')).toHaveCount(0)
  })
})

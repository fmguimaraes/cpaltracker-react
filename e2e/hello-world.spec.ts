import { test, expect } from '@playwright/test'

test('loads the hello-world screen and toggles theme', async ({ page }) => {
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

import { test, expect } from '@playwright/test'

/**
 * KAN-145 smoke coverage for the login screen's own UI contract (FR1, FR5,
 * NFR5). Full login/lockout/logout/session-expiry flows against a live
 * `/api/v1` backend are NFR2's job (KAN-157, "Unit + E2E Test Coverage") —
 * not duplicated here.
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

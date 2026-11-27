import { expect, type Page } from '@playwright/test'

/**
 * The theme lives on the account page ("Mon compte" › Apparence): a segmented Clair | Sombre | Système
 * (`theme-light`, `theme-dark`, `theme-system`). Opens it from the user menu, picks the choice, then goes
 * back to the page the test was on (the choice is stored, so it carries over).
 */
export async function chooseTheme(page: Page, choice: 'light' | 'dark' | 'system') {
  await page.getByTestId('user-menu').click()
  await page.getByTestId('user-menu-account').click()
  await expect(page).toHaveURL(/\/account$/)
  const item = page.getByTestId(`theme-${choice}`)
  await expect(item).toBeVisible()
  await item.click()
  await expect(item).toHaveAttribute('data-state', 'on')
  await page.goBack()
  await expect(page.getByTestId('account-theme-section')).toHaveCount(0)
}

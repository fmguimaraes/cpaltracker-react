import { expect, type Page } from '@playwright/test'

/**
 * The theme lives in the user menu (Pulse layout v2 §3): a segmented Clair | Sombre | Système
 * (`theme-light`, `theme-dark`, `theme-system`). Opens the menu, picks the choice, closes the menu.
 */
export async function chooseTheme(page: Page, choice: 'light' | 'dark' | 'system') {
  await page.getByTestId('user-menu').click()
  const item = page.getByTestId(`theme-${choice}`)
  await expect(item).toBeVisible()
  await item.click()
  await expect(item).toHaveAttribute('data-state', 'on')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('user-menu-theme')).toHaveCount(0)
}

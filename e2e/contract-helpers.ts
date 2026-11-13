import { expect, type Page } from '@playwright/test'

/**
 * The contract choice is global (operator decision 2026-10-29): a kit Select at the top of the sidebar.
 * Below 768 px the sidebar is a sheet (Radix Dialog, unmounted while closed), opened from the toolbar
 * first — the selector can't be found at all without opening it, whether or not it will turn out to
 * exist once open. Returns whether it actually opened the sheet (so a caller can close it again).
 */
async function openSidebarIfDrawer(page: Page): Promise<boolean> {
  const width = page.viewportSize()?.width ?? 1280
  if (width >= 768 || (await page.getByTestId('contract-selector').isVisible())) return false
  await page.getByTestId('shell-toolbar').getByRole('button').first().click()
  return true
}

/**
 * Opens the contract Select (and the sidebar sheet on mobile); options are then clickable. Returns
 * false without leaving anything open when the selector itself is hidden — a non-admin with a single
 * (already-selected) contract has nothing to pick between, so there is nothing to open. Closes the
 * mobile sheet again in that case, so it isn't left open, intercepting later clicks on the page.
 */
export async function openContractSelect(page: Page): Promise<boolean> {
  const openedDrawer = await openSidebarIfDrawer(page)
  const selector = page.getByTestId('contract-selector')
  // Waits out the contract list's own load (it may still be 'loading' right after goto()) before
  // deciding the selector is genuinely absent, not just not-yet-rendered.
  try {
    await selector.waitFor({ state: 'attached', timeout: 5000 })
  } catch {
    if (openedDrawer) {
      // Dismisses via the sheet's own overlay (outside click) — Escape isn't reliable here since
      // nothing inside the sheet ever received focus, and the toolbar's toggle button is now
      // covered by the sheet itself.
      const viewport = page.viewportSize()
      await page.locator('[data-slot="sheet-overlay"]').click({
        position: { x: (viewport?.width ?? 390) - 5, y: 5 },
      })
      await expect(page.getByRole('dialog')).toHaveCount(0)
    }
    return false
  }
  await selector.click()
  return true
}

/**
 * Picks a contract from the sidebar Select; closes the mobile sheet afterwards. A no-op when the selector
 * is hidden (see `openContractSelect`) — the single contract is already the one selected.
 */
export async function pickContract(page: Page, contractId: number) {
  const opened = await openContractSelect(page)
  if (!opened) return
  await page.getByTestId(`contract-option-${contractId}`).click()
  if ((page.viewportSize()?.width ?? 1280) < 768 && (await page.getByRole('dialog').isVisible())) {
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  }
}

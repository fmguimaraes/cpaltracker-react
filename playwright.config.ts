import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // VITE_API_BASE_URL is inlined at build time (Vite env rules, NFR7) — it
    // does not need to be reachable for the suite's own tests, since every
    // spec that needs a specific `/account.php` outcome mocks it with
    // `page.route`. An unset var would make `apiClient` throw before any
    // fetch is even issued, which `page.route` cannot intercept.
    command:
      'VITE_API_BASE_URL=http://localhost:4173/api/v1 npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

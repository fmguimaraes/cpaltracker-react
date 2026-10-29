import { defineConfig, devices } from '@playwright/test'

// E2E_PORT lets parallel runs (several agents, CI shards) use their own port and build folder.
const PORT = Number(process.env.E2E_PORT ?? 4173)
const OUT_DIR = PORT === 4173 ? 'dist' : `dist-e2e-${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // VITE_API_BASE_URL is inlined at build time (Vite env rules, NFR7) — it
    // does not need to be reachable for the suite's own tests, since every
    // spec that needs a specific `/account.php` outcome mocks it with
    // `page.route`. An unset var would make `apiClient` throw before any
    // fetch is even issued, which `page.route` cannot intercept.
    command: `VITE_API_BASE_URL=http://localhost:${PORT}/api/v1 npx vite build --outDir ${OUT_DIR} --emptyOutDir && npx vite preview --port ${PORT} --strictPort --outDir ${OUT_DIR}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

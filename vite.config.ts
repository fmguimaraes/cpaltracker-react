/// <reference types="vitest/config" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { securityHeadersPlugin } from './vite-plugin-security-headers'

export default defineConfig({
  plugins: [react(), tailwindcss(), securityHeadersPlugin()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  // Dev server: a test file is not part of the app, but its change still forced a full page reload
  // (losing UI state such as the selected period). Tests run through vitest's own watcher.
  server: {
    watch: { ignored: ['**/*.test.ts', '**/*.test.tsx', '**/e2e/**'] },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})

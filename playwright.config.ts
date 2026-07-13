import { createHash } from 'node:crypto'

import { defineConfig, devices } from '@playwright/test'

import { E2E_GATE_INPUT } from './e2e/access-fixture'

const e2eAccessPasswordHash = createHash('sha256').update(E2E_GATE_INPUT).digest('hex')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'chromium-compact',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
    },
    {
      name: 'webkit-smoke',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    env: {
      VITE_E2E_ACCESS_GATE: 'true',
      VITE_E2E_ACCESS_PASSWORD_SHA256: e2eAccessPasswordHash,
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})

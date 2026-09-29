// playwright.config.mjs: local browser checks against tools/serve.mjs (no CI, KTD5).
//
//   npm run test:e2e
//
// If the Playwright-managed Chromium is not installed, point PW_CHROMIUM_PATH at any
// Chromium/Chrome binary instead of running `npx playwright install`.

import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT) || 4179;

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : undefined,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
      },
    },
  ],
  webServer: {
    command: 'node tools/serve.mjs',
    url: `http://127.0.0.1:${PORT}/`,
    env: { PORT: String(PORT) },
    reuseExistingServer: false,
    timeout: 30_000,
  },
});

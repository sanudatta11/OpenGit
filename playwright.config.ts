import { defineConfig } from '@playwright/test';

/**
 * Layer B UI smoke tests (Playwright + Electron).
 * Requires a prior `npm run build` so `out/main/index.js` exists.
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    trace: 'off',
  },
});

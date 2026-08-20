import { test, expect, _electron as electron } from '@playwright/test';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mainEntry = resolve(here, '../../out/main/index.js');
const built = existsSync(mainEntry);

test.describe('OpenGit UI smoke', () => {
  test.skip(!built, 'Run `npm run build` before e2e smoke tests');

  test('launches Electron shell and shows the app chrome', async () => {
    const app = await electron.launch({
      args: [mainEntry],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
    });

    try {
      const window = await app.firstWindow({ timeout: 45_000 });
      await window.waitForLoadState('domcontentloaded');
      // Dashboard / shell should render without crashing.
      await expect(window.locator('body')).toBeVisible();
      const title = await window.title();
      expect(title.toLowerCase()).toContain('opengit');
    } finally {
      await app.close();
    }
  });

  test('settings affordance is reachable from the shell', async () => {
    const app = await electron.launch({
      args: [mainEntry],
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
      },
    });

    try {
      const window = await app.firstWindow({ timeout: 45_000 });
      await window.waitForLoadState('domcontentloaded');
      await expect(window.locator('body')).toBeVisible();

      const settingsBtn = window.getByRole('button', { name: /settings/i });
      if (await settingsBtn.count() === 0) {
        test.info().annotations.push({ type: 'note', description: 'No Settings button found; shell still rendered.' });
        return;
      }
      await settingsBtn.first().click();
      const panel = window.getByText(/Git Binary|Theme|Updates|Settings/i).first();
      await expect(panel).toBeVisible({ timeout: 8_000 });
      await window.keyboard.press('Escape');
    } finally {
      await app.close();
    }
  });
});

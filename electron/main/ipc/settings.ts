// electron/main/ipc/settings.ts — settings IPC handlers.

import { ipcMain } from 'electron';
import { IPC, SettingsSetInput, GitError, type SettingsData } from '@shared/ipc';
import { loadSettings, saveSettings, addRecentRepo, removeRecentRepo } from '../settings';
import { discoverGitBin } from '../git/client';

export function registerSettingsHandlers(): void {
  ipcMain.handle(IPC.SETTINGS_GET, async (): Promise<SettingsData> => {
    return loadSettings();
  });

  ipcMain.handle(IPC.SETTINGS_SET, async (_e, raw) => {
    const parsed = SettingsSetInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid settings request.',
      });
    }
    const next = saveSettings(parsed.data);

    // If gitBinPath changed, re-discover.
    if (parsed.data.gitBinPath !== undefined) {
      try {
        await discoverGitBin(next.gitBinPath ?? undefined);
      } catch {
        // ignore — renderer will show error
      }
    }

    return next;
  });

  ipcMain.handle(IPC.SETTINGS_RECENT_REPOS, async (): Promise<string[]> => {
    return loadSettings().recentRepos;
  });

  ipcMain.handle(IPC.SETTINGS_ADD_RECENT, async (_e, raw: unknown) => {
    const path = raw as string;
    if (typeof path === 'string' && path.length > 0) {
      addRecentRepo(path);
    }
    return loadSettings().recentRepos;
  });

  ipcMain.handle(IPC.SETTINGS_REMOVE_RECENT, async (_e, raw: unknown) => {
    const path = raw as string;
    if (typeof path === 'string') {
      removeRecentRepo(path);
    }
    return loadSettings().recentRepos;
  });
}

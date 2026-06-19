// electron/main/ipc/updater.ts — updater IPC handlers.

import { ipcMain } from 'electron';
import { IPC, type UpdaterCheckResult } from '@shared/ipc';
import { checkForUpdates } from '../updater';

export function registerUpdaterHandlers(): void {
  ipcMain.handle(IPC.UPDATER_CHECK, async (): Promise<UpdaterCheckResult> => {
    return checkForUpdates();
  });
}

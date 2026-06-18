// electron/main/ipc/log.ts — operation log subscribe/unsubscribe + initial snapshot.

import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import type { LogEntry } from '@shared/git';
import { logStore } from '../log/emitter';

export function registerLogHandlers(): void {
  ipcMain.handle(IPC.LOG_SUBSCRIBE, (e) => {
    const webContents = e.sender;
    // Send snapshot first.
    for (const entry of logStore.snapshot()) {
      if (!webContents.isDestroyed()) webContents.send(IPC.LOG_EVENT, entry);
    }
    const onEntry = (entry: LogEntry) => {
      if (!webContents.isDestroyed()) webContents.send(IPC.LOG_EVENT, entry);
    };
    logStore.on('entry', onEntry);
    // webContents is destroyed when the window closes — clean up the listener.
    webContents.once('destroyed', () => {
      logStore.off('entry', onEntry);
    });
    return { success: true };
  });

  ipcMain.handle(IPC.LOG_UNSUBSCRIBE, () => {
    // Per-window unsubscribe handled by 'destroyed' above. No-op for now.
    return { success: true };
  });
}

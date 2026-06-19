// electron/main/updater.ts — auto-update lifecycle (electron-updater).
// Runs only in packaged builds; dev (app.isPackaged === false) is a no-op.
// Channel is derived from the version's semver prerelease tag at build time
// (stable -> "latest", beta -> "beta") and baked into app-update.yml by
// electron-builder. The user's betaUpdates setting overrides that default so
// a stable-installed user can opt into the beta track without reinstalling.

import { BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateInfo } from 'electron-updater';
import { IPC, type UpdaterEvent, type UpdaterInfo, type UpdaterCheckResult } from '@shared/ipc';
import { loadSettings } from './settings';

let initialized = false;

function toUpdaterInfo(info: UpdateInfo): UpdaterInfo {
  return {
    version: info.version,
    releaseName: info.releaseName ?? null,
    releaseNotes: info.releaseNotes ?? null,
    releaseDate: info.releaseDate,
  };
}

function broadcast(event: UpdaterEvent): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC.UPDATER_EVENT, event);
  }
}

function applyChannelFromSettings(): void {
  const { betaUpdates } = loadSettings();
  autoUpdater.channel = betaUpdates ? 'beta' : 'latest';
}

export function initUpdater(): void {
  if (initialized) return;
  initialized = true;
  // Full-auto: defaults autoDownload=true, autoInstallOnAppQuit=true. The
  // renderer only displays status; it never triggers download/install.
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on('update-available', (info) => {
    broadcast({ type: 'available', info: toUpdaterInfo(info) });
  });
  autoUpdater.on('update-downloaded', (event) => {
    broadcast({
      type: 'downloaded',
      info: toUpdaterInfo(event),
      version: event.version,
    });
  });
  autoUpdater.on('update-not-available', (info) => {
    broadcast({ type: 'not-available', info: toUpdaterInfo(info) });
  });
  autoUpdater.on('error', (error, message) => {
    broadcast({ type: 'error', message: message ?? error?.message ?? 'Unknown update error' });
  });

  applyChannelFromSettings();
  void autoUpdater.checkForUpdates().catch((err) => {
    broadcast({ type: 'error', message: err?.message ?? 'Update check failed' });
  });
}

export async function checkForUpdates(): Promise<UpdaterCheckResult> {
  applyChannelFromSettings();
  try {
    const result = await autoUpdater.checkForUpdates();
    const info = result?.updateInfo;
    if (!info) return { status: 'up-to-date' };
    if (info.version !== autoUpdater.currentVersion) {
      return { status: 'available', version: info.version };
    }
    return { status: 'up-to-date', version: info.version };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

// Reset for tests / repeated init. Not used at runtime.
export function _resetUpdaterForTests(): void {
  initialized = false;
}

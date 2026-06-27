// electron/main/index.ts — Electron main entry. Window lifecycle, security,
// git discovery, IPC registration, watcher.

import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { discoverGitBin, cancelAll } from './git/client';
import { registerAllHandlers } from './ipc';
import { stopWatching, startWatching } from './watcher';
import { initUpdater } from './updater';
import { GitError } from '@shared/ipc';
import { loadSettings } from './settings';
import { openRepo } from './git/repo';
import { addRepo, getRepo } from './git/session';

const isDev = !app.isPackaged;

// ── CLI: parse --opengit-repo=<path> from argv ──────────────────────────────
function parseCliRepoArg(argv: string[]): string | null {
  for (const arg of argv.slice(2)) {
    if (arg.startsWith('--opengit-repo=')) {
      const repoPath = arg.slice('--opengit-repo='.length);
      if (repoPath && existsSync(repoPath)) return repoPath;
    }
  }
  return null;
}

const cliRepoPath = parseCliRepoArg(process.argv);

// ── Single instance lock ────────────────────────────────────────────────────
// If another instance is running, focus it and send the repo path there.
let mainWindow: BrowserWindow | null = null;
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const repoPath = parseCliRepoArg(argv);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      if (repoPath) {
        mainWindow.webContents.send('open-repo', repoPath);
      }
    }
  });
}

function resolvePreload(): string {
  const dir = join(__dirname, '../preload');
  for (const file of ['index.js', 'index.cjs', 'index.mjs']) {
    const preload = join(dir, file);
    if (existsSync(preload)) return preload;
  }

  return join(dir, 'index.js');
}

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#0d1117',
    title: 'OpenGit',
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: resolvePreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: !isDev && !process.env['OPENGIT_NO_SANDBOX'],
      webviewTag: false,
    },
  });

  win.on('ready-to-show', () => win.show());

  // Open external links in the OS browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  // CSP + security headers.
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          isDev
            ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: http://localhost:* ws://localhost:*"
            : "default-src 'self' 'unsafe-inline' data: blob:",
        ],
      },
    });
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    await win.loadURL(process.env['ELECTRON_RENDERER_URL']);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    await win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return win;
}

app.whenReady().then(async () => {
  // 1. Locate git. If missing, the renderer will show a "Git not found" screen.
  try {
    await discoverGitBin(process.env['OPENGIT_GIT_BIN']);
  } catch (err) {
    if (err instanceof GitError && err.code === 'GitNotFound') {
      // Don't crash — renderer will surface it.
      console.warn('[opengit] git not found:', err.friendly);
    } else {
      throw err;
    }
  }

  // 2. Register IPC handlers.
  registerAllHandlers();

  // 3. Reopen only the last active repo from the persisted tab session.
  const settings = loadSettings();
  const activeTab = settings.tabSession?.tabs.find((tab) => tab.id === settings.tabSession?.activeTabId);
  const activeRepoPath = activeTab?.kind === 'repo'
    ? activeTab.repoPath
    : settings.openRepos[settings.openRepos.length - 1] ?? null;

  if (activeRepoPath) {
    try {
      const opened = await openRepo(activeRepoPath);
      addRepo(opened);
    } catch (err) {
      console.warn('[opengit] failed to reopen repo:', activeRepoPath, (err as Error).message);
    }
  }

  // 4. Create the main window.
  const win = await createWindow();
  mainWindow = win;

  // 5. Open repo from CLI arg (if provided and not already opened above).
  if (cliRepoPath) {
    const alreadyOpen = getRepo(cliRepoPath);
    if (!alreadyOpen) {
      try {
        const opened = await openRepo(cliRepoPath);
        addRepo(opened);
        startWatching(opened.gitDir, opened.workTreeRoot, win, opened.info.path);
      } catch (err) {
        console.warn('[opengit] failed to open CLI repo:', cliRepoPath, (err as Error).message);
      }
    }
  }

  // 6. Start watcher for the eager auto-reopened repo only.
  if (activeRepoPath) {
    const r = getRepo(activeRepoPath);
    if (r) startWatching(r.gitDir, r.workTreeRoot, win, activeRepoPath);
  }

  // 7. Start auto-updater (only in packaged builds; dev has no app-update.yml).
  if (app.isPackaged) {
    try {
      initUpdater();
    } catch (err) {
      console.warn('[opengit] updater init failed:', err);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  cancelAll();
  void stopWatching();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  cancelAll();
  void stopWatching();
});

// Surface uncaught errors so they appear in the operation log later, not as silent failures.
process.on('unhandledRejection', (reason) => {
  console.error('[opengit] unhandled rejection:', reason);
});

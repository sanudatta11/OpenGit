// electron/main/settings.ts — persistent settings via JSON file in app userData.
// Stores: git binary path, recent repos, UI preferences.

import { app } from 'electron';
import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

export interface Settings {
  gitBinPath: string | null;
  recentRepos: string[];
  defaultDiffView: 'side-by-side' | 'unified';
  showUntracked: boolean;
  contextLines: number;
  theme: 'system' | 'dark' | 'light';
  fontSize: number;
  defaultBranch: string;
  pullStrategy: 'merge' | 'rebase' | 'ff-only';
  commitSubjectLength: number;
  conventionalCommitValidation: boolean;
  signingMode: 'none' | 'gpg' | 'ssh';
  defaultExternalEditor: string | null;
  sidebarWidth: number;
  inspectorWidth: number;
  autoFetchInterval: number;
  betaUpdates: boolean;
}

const DEFAULTS: Settings = {
  gitBinPath: null,
  recentRepos: [],
  defaultDiffView: 'side-by-side',
  showUntracked: true,
  contextLines: 3,
  theme: 'system',
  fontSize: 13,
  defaultBranch: 'main',
  pullStrategy: 'merge',
  commitSubjectLength: 72,
  conventionalCommitValidation: false,
  signingMode: 'none',
  defaultExternalEditor: null,
  sidebarWidth: 256,
  inspectorWidth: 360,
  autoFetchInterval: 0,
  betaUpdates: false,
};

const MAX_RECENT = 10;

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function loadSettings(): Settings {
  try {
    const p = settingsPath();
    if (!existsSync(p)) return { ...DEFAULTS };
    const raw = readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: Partial<Settings>): Settings {
  const current = loadSettings();
  const next = { ...current, ...settings };
  try {
    const dir = app.getPath('userData');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.error('[opengit] failed to save settings:', err);
  }
  return next;
}

export function addRecentRepo(path: string): void {
  const settings = loadSettings();
  const filtered = settings.recentRepos.filter((r) => r !== path);
  filtered.unshift(path);
  if (filtered.length > MAX_RECENT) filtered.length = MAX_RECENT;
  saveSettings({ recentRepos: filtered });
}

export function removeRecentRepo(path: string): void {
  const settings = loadSettings();
  saveSettings({ recentRepos: settings.recentRepos.filter((r) => r !== path) });
}

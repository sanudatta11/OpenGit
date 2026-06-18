// electron/main/watcher.ts — chokidar watcher on .git/ for repo refresh events.
// Debounced 150ms → broadcasts a WatchEvent to the renderer.

import chokidar, { type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { BrowserWindow } from 'electron';
import { IPC, type WatchEvent, type WatchEventKind } from '@shared/ipc';

let watcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;
const pendingKinds = new Set<WatchEventKind>();

const PATH_TO_KIND: Readonly<Record<string, WatchEventKind>> = {
  HEAD: 'head',
  index: 'index',
  MERGE_HEAD: 'merge',
  CHERRY_PICK_HEAD: 'cherry-pick',
  REVERT_HEAD: 'revert',
  BISECT_LOG: 'bisect',
};

export function startWatching(gitDir: string, win: BrowserWindow): void {
  void stopWatching();

  const refsDir = join(gitDir, 'refs');
  const rebaseMergeDir = join(gitDir, 'rebase-merge');
  const rebaseApplyDir = join(gitDir, 'rebase-apply');

  const paths = [join(gitDir, 'HEAD'), join(gitDir, 'index')];
  if (existsSync(refsDir)) paths.push(`${refsDir}/**/*`);
  if (existsSync(rebaseMergeDir)) paths.push(`${rebaseMergeDir}/**/*`);
  if (existsSync(rebaseApplyDir)) paths.push(`${rebaseApplyDir}/**/*`);
  for (const f of Object.keys(PATH_TO_KIND)) {
    const p = join(gitDir, f);
    if (f !== 'HEAD' && f !== 'index') paths.push(p);
  }

  watcher = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 },
  });

  watcher.on('all', (_event, path) => {
    const base = path.split('/').pop() ?? path;
    // Skip if path is under rebase-merge/ or rebase-apply/ (those are rebase progress, not state changes per se)
    if (path.includes('rebase-merge/') || path.includes('rebase-apply/')) {
      pendingKinds.add('rebase');
    } else if (path.includes('/refs/')) {
      pendingKinds.add('refs');
    } else {
      const kind = PATH_TO_KIND[base];
      if (kind) pendingKinds.add(kind);
      else pendingKinds.add('index'); // unknown change in .git root → treat as index-ish
    }

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const kinds = [...pendingKinds];
      pendingKinds.clear();
      debounceTimer = null;
      for (const kind of kinds) {
        const evt: WatchEvent = { kind, ts: Date.now() };
        if (!win.isDestroyed()) win.webContents.send(IPC.WATCH_EVENT, evt);
      }
    }, 150);
  });
}

export async function stopWatching(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingKinds.clear();
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
}

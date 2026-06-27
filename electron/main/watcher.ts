// electron/main/watcher.ts — chokidar watcher on .git/ for repo refresh events.
// Debounced 150ms → broadcasts a WatchEvent to the renderer.
// Multi-repo: one watcher per repo path, managed via startWatching/stopWatching.

import chokidar, { type FSWatcher } from 'chokidar';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { BrowserWindow } from 'electron';
import { IPC, type WatchEvent, type WatchEventKind } from '@shared/ipc';
import { invalidateCache } from './git/refsCache';

interface RepoWatcher {
  watcher: FSWatcher;
  workWatcher: FSWatcher;
  debounceTimer: NodeJS.Timeout | null;
  pendingKinds: Set<WatchEventKind>;
}

const watchers = new Map<string, RepoWatcher>();

const PATH_TO_KIND: Readonly<Record<string, WatchEventKind>> = {
  HEAD: 'head',
  index: 'index',
  MERGE_HEAD: 'merge',
  CHERRY_PICK_HEAD: 'cherry-pick',
  REVERT_HEAD: 'revert',
  BISECT_LOG: 'bisect',
};

function startRepoWatcher(gitDir: string, workTreeRoot: string, win: BrowserWindow, repoPath: string): void {
  void stopWatching(repoPath);

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

  const rw: RepoWatcher = {
    watcher: chokidar.watch(paths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 20 },
      dot: true,
    } as any),
    workWatcher: chokidar.watch('.', {
      cwd: workTreeRoot,
      ignoreInitial: true,
      ignored: /(\.git\/|node_modules|\.next)/,
      depth: 0,
      dot: true,
    } as any),
    debounceTimer: null,
    pendingKinds: new Set(),
  };

  const debounceAndSend = () => {
    if (rw.debounceTimer) clearTimeout(rw.debounceTimer);
    rw.debounceTimer = setTimeout(() => {
      const kinds = [...rw.pendingKinds];
      rw.pendingKinds.clear();
      rw.debounceTimer = null;
      for (const kind of kinds) {
        const evt: WatchEvent = { kind, ts: Date.now() };
        if (!win.isDestroyed()) win.webContents.send(IPC.WATCH_EVENT, evt);
      }
    }, 150);
  };

  rw.watcher.on('all', (_event, path) => {
    const base = path.split('/').pop() ?? path;
    if (path.includes('rebase-merge/') || path.includes('rebase-apply/')) {
      rw.pendingKinds.add('rebase');
    } else if (path.includes('/refs/')) {
      rw.pendingKinds.add('refs');
      invalidateCache();
    } else {
      const kind = PATH_TO_KIND[base];
      if (kind) rw.pendingKinds.add(kind);
      else rw.pendingKinds.add('index');
      if (kind === 'head') invalidateCache();
    }
    debounceAndSend();
  });

  rw.workWatcher.on('all', () => {
    rw.pendingKinds.add('index');
    debounceAndSend();
  });

  watchers.set(repoPath, rw);
}

export function startWatching(gitDir: string, workTreeRoot: string, win: BrowserWindow, repoPath?: string): void {
  const key = repoPath ?? workTreeRoot;
  startRepoWatcher(gitDir, workTreeRoot, win, key);
}

export async function stopWatching(repoPath?: string): Promise<void> {
  if (repoPath) {
    const rw = watchers.get(repoPath);
    if (rw) {
      if (rw.debounceTimer) clearTimeout(rw.debounceTimer);
      rw.pendingKinds.clear();
      await rw.watcher.close();
      await rw.workWatcher.close();
      watchers.delete(repoPath);
    }
    return;
  }
  // Stop all watchers.
  for (const [key, rw] of watchers) {
    if (rw.debounceTimer) clearTimeout(rw.debounceTimer);
    rw.pendingKinds.clear();
    await rw.watcher.close();
    await rw.workWatcher.close();
    watchers.delete(key);
  }
}

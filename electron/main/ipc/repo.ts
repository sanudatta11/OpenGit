// electron/main/ipc/repo.ts — repo read handlers. Phase 1 scope.

import { ipcMain, dialog } from 'electron';
import { IPC, RepoOpenInput, RepoCloseInput, RepoLogInput, RepoCreateInput, RepoCloneInput, RepoSearchInput } from '@shared/ipc';
import { GitError } from '@shared/ipc';
import {
  openRepo,
  getStatus,
  getLog,
  getBranches,
  getRemotes,
  getState,
  searchRepository,
  trustRepoPath,
} from '../git/repo';
import { createRepository, cloneRepository } from '../git/lifecycle';
import { getCachedRefs, fetchRefs, invalidateCache } from '../git/refsCache';
import { setCurrentRepo, getCurrentRepo, requireCurrentRepo, switchActiveRepo, removeRepo as removeSessionRepo, getOpenRepoInfos } from '../git/session';
import { addRecentRepo, removeRecentRepo, addOpenRepo, removeOpenRepo } from '../settings';
import { startWatching, stopWatching } from '../watcher';
import { BrowserWindow } from 'electron';

export function registerRepoHandlers(): void {
  ipcMain.handle('dialog:pickRepo', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open Repository',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0]!;
  });

  ipcMain.handle('dialog:pickDirectory', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose Directory',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0]!;
  });

  ipcMain.handle(IPC.REPO_CREATE, async (_e, raw) => {
    const parsed = RepoCreateInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message, 'Invalid request to create a repo.');
    const result = await createRepository(parsed.data);
    if (result.success && result.data?.path && !parsed.data.bare) {
      const opened = await openRepo(result.data.path);
      setCurrentRepo(opened);
      addRecentRepo(opened.info.path);
      const win = BrowserWindow.getFocusedWindow();
      if (win) startWatching(opened.gitDir, opened.workTreeRoot, win);
    }
    return result;
  });

  ipcMain.handle(IPC.REPO_CLONE, async (_e, raw) => {
    const parsed = RepoCloneInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message, 'Invalid request to clone a repo.');
    const result = await cloneRepository(parsed.data);
    if (result.success && result.data?.path) {
      const opened = await openRepo(result.data.path);
      setCurrentRepo(opened);
      addRecentRepo(opened.info.path);
      const win = BrowserWindow.getFocusedWindow();
      if (win) startWatching(opened.gitDir, opened.workTreeRoot, win);
    }
    return result;
  });

  ipcMain.handle(IPC.REPO_OPEN, async (_e, raw) => {
    const parsed = RepoOpenInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid request to open a repo.',
      });
    }
    try {
      const opened = await openRepo(parsed.data.path);
      setCurrentRepo(opened);
      addRecentRepo(opened.info.path);
      addOpenRepo(opened.info.path);
      // Start watching .git for changes (per-repo watcher).
      const win = BrowserWindow.getFocusedWindow();
      if (win) startWatching(opened.gitDir, opened.workTreeRoot, win, opened.info.path);
      return opened.info;
    } catch (err) {
      if (err instanceof GitError) throw err;
      const msg = (err as Error).message ?? String(err);
      throw new GitError({
        code: msg.includes('Not a') ? 'NotARepo' : 'GitFailed',
        message: msg,
        stdout: '',
        stderr: '',
        friendly: msg.includes('Not a')
          ? 'This path is not inside a Git repository.'
          : 'Failed to open the repository.',
      });
    }
  });

  ipcMain.handle(IPC.REPO_CLOSE, async (_e, raw) => {
    const parsed = RepoCloseInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message, 'Invalid request to close a repo.');
    const removed = removeSessionRepo(parsed.data.path);
    if (removed) {
      removeOpenRepo(removed.info.path);
      void stopWatching(removed.info.path);
    }
    return { success: true };
  });

  ipcMain.handle(IPC.REPO_REMOVE_FROM_APP, async (_e, raw: unknown) => {
    if (typeof raw === 'string') removeRecentRepo(raw);
    return { success: true };
  });

  ipcMain.handle(IPC.REPO_STATUS, async () => {
    const r = requireCurrentRepo();
    return getStatus(r.workTreeRoot, r.gitDir);
  });

  ipcMain.handle(IPC.REPO_LOG, async (_e, raw) => {
    const parsed = RepoLogInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid log request.',
      });
    }
    const r = requireCurrentRepo();
    // Use cached refs if available; otherwise fetch + cache.
    let refsBySha = getCachedRefs(r.info.path)?.refsBySha ?? null;
    if (!refsBySha) {
      const fetched = await fetchRefs(r.workTreeRoot, r.gitDir, r.info.path);
      refsBySha = fetched.refsBySha;
    }
    return getLog(r.workTreeRoot, {
      range: parsed.data.range,
      skip: parsed.data.skip,
      limit: parsed.data.limit,
      paths: parsed.data.paths,
      refsBySha,
    });
  });

  ipcMain.handle(IPC.REPO_BRANCHES, async () => {
    const r = requireCurrentRepo();
    const { branches } = await getBranches(r.workTreeRoot, r.gitDir);
    return branches;
  });

  ipcMain.handle(IPC.REPO_REMOTES, async () => {
    const r = requireCurrentRepo();
    return getRemotes(r.workTreeRoot);
  });

  ipcMain.handle(IPC.REPO_STATE, async () => {
    const r = requireCurrentRepo();
    return getState(r.workTreeRoot, r.gitDir);
  });

  ipcMain.handle(IPC.REPO_HEAD, async () => {
    const r = getCurrentRepo();
    if (!r) return null;
    return r.info;
  });

  ipcMain.handle(IPC.REPO_SET_ACTIVE, async (_e, raw: unknown) => {
    if (typeof raw !== 'string' || !raw) throw new GitError({
      code: 'BadInput', message: 'Expected repo path string', stdout: '', stderr: '',
      friendly: 'Invalid request to switch active repo.',
    });
    switchActiveRepo(raw);
    return getCurrentRepo()?.info ?? null;
  });

  ipcMain.handle(IPC.REPO_LIST, async () => {
    return getOpenRepoInfos();
  });

  ipcMain.handle(IPC.REPO_SEARCH, async (_e, raw) => {
    const parsed = RepoSearchInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message, 'Invalid repository search request.');
    const r = requireCurrentRepo();
    return searchRepository(r.workTreeRoot, r.gitDir, parsed.data.query, parsed.data.limit);
  });

  ipcMain.handle(IPC.REPO_TRUST, async (_e, raw: unknown) => {
    const path = typeof raw === 'string' ? raw : requireCurrentRepo().workTreeRoot;
    await trustRepoPath(path);
    invalidateCache();
    return { success: true };
  });
}

function badInput(message: string, friendly: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly });
}

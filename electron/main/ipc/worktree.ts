// electron/main/ipc/worktree.ts — worktree IPC handlers.

import { ipcMain } from 'electron';
import { IPC, GitError, WorktreeCreateInput, WorktreeRemoveInput, WorktreeRemoveAndDeleteInput, WorktreeLockInput, WorktreeUnlockInput } from '@shared/ipc';
import {
  listWorktrees, createWorktree, removeWorktree, pruneWorktrees,
  lockWorktree, unlockWorktree, removeWorktreeAndBranch,
} from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerWorktreeHandlers(): void {
  ipcMain.handle(IPC.WORKTREE_LIST, async () => {
    const r = requireCurrentRepo();
    return listWorktrees(r.workTreeRoot);
  });

  ipcMain.handle(IPC.WORKTREE_CREATE, async (_e, raw) => {
    const parsed = WorktreeCreateInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return createWorktree(r.workTreeRoot, {
      path: parsed.data.path,
      branch: parsed.data.branch,
      start: parsed.data.start,
      lock: parsed.data.lock,
    });
  });

  ipcMain.handle(IPC.WORKTREE_REMOVE, async (_e, raw) => {
    const parsed = WorktreeRemoveInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return removeWorktree(r.workTreeRoot, parsed.data.path, parsed.data.force);
  });

  ipcMain.handle(IPC.WORKTREE_PRUNE, async () => {
    const r = requireCurrentRepo();
    return pruneWorktrees(r.workTreeRoot);
  });

  ipcMain.handle(IPC.WORKTREE_LOCK, async (_e, raw) => {
    const parsed = WorktreeLockInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return lockWorktree(r.workTreeRoot, parsed.data.path, parsed.data.reason);
  });

  ipcMain.handle(IPC.WORKTREE_UNLOCK, async (_e, raw) => {
    const parsed = WorktreeUnlockInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return unlockWorktree(r.workTreeRoot, parsed.data.path);
  });

  ipcMain.handle(IPC.WORKTREE_REMOVE_AND_DELETE_BRANCH, async (_e, raw) => {
    const parsed = WorktreeRemoveAndDeleteInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return removeWorktreeAndBranch(r.workTreeRoot, parsed.data.path, parsed.data.branch, parsed.data.force);
  });
}

function badInput(message: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly: 'Invalid worktree request.' });
}

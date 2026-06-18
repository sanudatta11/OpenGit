// electron/main/ipc/workingTree.ts — stage/unstage/discard IPC handlers.

import { ipcMain } from 'electron';
import {
  IPC, PathListInput, GitError,
} from '@shared/ipc';
import {
  stagePaths, stageAll, unstagePaths, unstageAll,
  discardPaths, discardUntracked, stageHunks, unstageHunks,
} from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerWorkingTreeHandlers(): void {
  ipcMain.handle(IPC.WORKING_TREE_STAGE, async (_e, raw) => {
    const parsed = PathListInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message, 'Invalid stage request.');
    const r = requireCurrentRepo();
    return stagePaths(r.workTreeRoot, parsed.data.paths);
  });

  ipcMain.handle('workingTree:stageAll', async () => {
    const r = requireCurrentRepo();
    return stageAll(r.workTreeRoot);
  });

  ipcMain.handle(IPC.WORKING_TREE_UNSTAGE, async (_e, raw) => {
    const parsed = PathListInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message, 'Invalid unstage request.');
    const r = requireCurrentRepo();
    return unstagePaths(r.workTreeRoot, parsed.data.paths);
  });

  ipcMain.handle('workingTree:unstageAll', async () => {
    const r = requireCurrentRepo();
    return unstageAll(r.workTreeRoot);
  });

  ipcMain.handle(IPC.WORKING_TREE_DISCARD, async (_e, raw) => {
    const parsed = PathListInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message, 'Invalid discard request.');
    const r = requireCurrentRepo();
    // Caller classifies tracked vs untracked; we run both in parallel-safe sequence.
    // For simplicity, try checkout first (tracked); if file is untracked, caller
    // should pass it via the untracked channel. Here we just checkout.
    return discardPaths(r.workTreeRoot, parsed.data.paths);
  });

  ipcMain.handle('workingTree:discardUntracked', async (_e, raw) => {
    const parsed = PathListInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message, 'Invalid discard request.');
    const r = requireCurrentRepo();
    return discardUntracked(r.workTreeRoot, parsed.data.paths);
  });

  ipcMain.handle(IPC.WORKING_TREE_STAGE_HUNKS, async (_e, raw) => {
    const r = requireCurrentRepo();
    const { path, patch } = raw as { path: string; patch: string };
    if (!path || !patch) throw badInput('Missing path or patch', 'Invalid hunk stage request.');
    return stageHunks(r.workTreeRoot, path, patch);
  });

  ipcMain.handle(IPC.WORKING_TREE_UNSTAGE_HUNKS, async (_e, raw) => {
    const r = requireCurrentRepo();
    const { path, patch } = raw as { path: string; patch: string };
    if (!path || !patch) throw badInput('Missing path or patch', 'Invalid hunk unstage request.');
    return unstageHunks(r.workTreeRoot, path, patch);
  });
}

function badInput(message: string, friendly: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly });
}

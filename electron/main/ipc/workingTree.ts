// electron/main/ipc/workingTree.ts — stage/unstage/discard IPC handlers.

import { ipcMain } from 'electron';
import {
  IPC, PathListInput, HunkStageInput, GitError,
} from '@shared/ipc';
import {
  stagePaths, stageAll, unstagePaths, unstageAll,
  discardPaths, discardUntracked, discardAllUnstaged, stageHunks, unstageHunks,
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
    return discardPaths(r.workTreeRoot, parsed.data.paths);
  });

  ipcMain.handle('workingTree:discardUntracked', async (_e, raw) => {
    const parsed = PathListInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message, 'Invalid discard request.');
    const r = requireCurrentRepo();
    return discardUntracked(r.workTreeRoot, parsed.data.paths);
  });

  ipcMain.handle(IPC.WORKING_TREE_DISCARD_ALL_UNSTAGED, async () => {
    const r = requireCurrentRepo();
    return discardAllUnstaged(r.workTreeRoot, r.gitDir);
  });

  ipcMain.handle(IPC.WORKING_TREE_STAGE_HUNKS, async (_e, raw) => {
    const parsed = HunkStageInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message, 'Invalid hunk stage request.');
    const r = requireCurrentRepo();
    return stageHunks(r.workTreeRoot, parsed.data.path, parsed.data.patch);
  });

  ipcMain.handle(IPC.WORKING_TREE_UNSTAGE_HUNKS, async (_e, raw) => {
    const parsed = HunkStageInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message, 'Invalid hunk unstage request.');
    const r = requireCurrentRepo();
    return unstageHunks(r.workTreeRoot, parsed.data.path, parsed.data.patch);
  });
}

function badInput(message: string, friendly: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly });
}

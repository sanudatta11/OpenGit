// electron/main/ipc/stash.ts — stash IPC handlers.

import { ipcMain } from 'electron';
import { IPC, GitError, StashCreateInput, StashApplyInput, StashRefInput, StashDiffInput } from '@shared/ipc';
import {
  listStashes, createStash, applyStash, popStash, dropStash, stashDiff,
} from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerStashHandlers(): void {
  ipcMain.handle(IPC.STASH_LIST, async () => {
    const r = requireCurrentRepo();
    return listStashes(r.workTreeRoot);
  });

  ipcMain.handle(IPC.STASH_CREATE, async (_e, raw) => {
    const parsed = StashCreateInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return createStash(r.workTreeRoot, {
      message: parsed.data.message,
      includeUntracked: parsed.data.includeUntracked,
      keepIndex: parsed.data.keepIndex,
    });
  });

  ipcMain.handle(IPC.STASH_APPLY, async (_e, raw) => {
    const parsed = StashApplyInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return applyStash(r.workTreeRoot, parsed.data.ref, parsed.data.keepIndex);
  });

  ipcMain.handle(IPC.STASH_POP, async (_e, raw) => {
    const parsed = StashApplyInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return popStash(r.workTreeRoot, parsed.data.ref, parsed.data.keepIndex);
  });

  ipcMain.handle(IPC.STASH_DROP, async (_e, raw) => {
    const parsed = StashRefInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return dropStash(r.workTreeRoot, parsed.data.ref);
  });

  ipcMain.handle(IPC.STASH_DIFF, async (_e, raw) => {
    const parsed = StashDiffInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return stashDiff(r.workTreeRoot, parsed.data.ref);
  });
}

function badInput(message: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly: 'Invalid stash request.' });
}

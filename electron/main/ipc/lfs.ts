// electron/main/ipc/lfs.ts — Git LFS IPC handlers.

import { ipcMain } from 'electron';
import { IPC, GitError, LfsTrackInput, LfsUntrackInput } from '@shared/ipc';
import { listLFSTracked, lfsTrack, lfsUntrack } from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerLfsHandlers(): void {
  ipcMain.handle(IPC.LFS_LIST, async () => {
    const r = requireCurrentRepo();
    return listLFSTracked(r.workTreeRoot);
  });

  ipcMain.handle(IPC.LFS_TRACK, async (_e, raw) => {
    const parsed = LfsTrackInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return lfsTrack(r.workTreeRoot, parsed.data.pattern);
  });

  ipcMain.handle(IPC.LFS_UNTRACK, async (_e, raw) => {
    const parsed = LfsUntrackInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return lfsUntrack(r.workTreeRoot, parsed.data.pattern);
  });
}

function badInput(message: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly: 'Invalid LFS request.' });
}

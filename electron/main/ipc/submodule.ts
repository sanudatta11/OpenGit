// electron/main/ipc/submodule.ts — submodule IPC handlers.

import { ipcMain } from 'electron';
import { IPC, GitError, SubmoduleInitInput, SubmoduleDeinitInput } from '@shared/ipc';
import { listSubmodules, initSubmodules, deinitSubmodule } from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerSubmoduleHandlers(): void {
  ipcMain.handle(IPC.SUBMODULE_LIST, async () => {
    const r = requireCurrentRepo();
    return listSubmodules(r.workTreeRoot);
  });

  ipcMain.handle(IPC.SUBMODULE_INIT, async (_e, raw) => {
    const parsed = SubmoduleInitInput.safeParse(raw ?? {});
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return initSubmodules(r.workTreeRoot, parsed.data.recursive);
  });

  ipcMain.handle(IPC.SUBMODULE_DEINIT, async (_e, raw) => {
    const parsed = SubmoduleDeinitInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return deinitSubmodule(r.workTreeRoot, parsed.data.path, parsed.data.force);
  });
}

function badInput(message: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly: 'Invalid submodule request.' });
}

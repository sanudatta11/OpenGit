// electron/main/ipc/rebase.ts — interactive rebase IPC handlers.

import { ipcMain } from 'electron';
import { IPC, GitError } from '@shared/ipc';
import { rebaseInteractivePlan, applyRebaseInteractive } from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerRebaseHandlers(): void {
  ipcMain.handle(IPC.BRANCH_REBASE_INTERACTIVE, async (_e, raw) => {
    const { onto } = raw as { onto: string };
    if (!onto) throw new GitError({ code: 'BadInput', message: 'Missing onto', stdout: '', stderr: '', friendly: 'Specify a target branch.' });
    const r = requireCurrentRepo();
    return rebaseInteractivePlan(r.workTreeRoot, onto);
  });

  ipcMain.handle(IPC.REBASE_INTERACTIVE_APPLY, async (_e, raw) => {
    const { onto, items } = raw as { onto: string; items: { action: string; sha: string }[] };
    if (!onto || !items) throw new GitError({ code: 'BadInput', message: 'Missing onto or items', stdout: '', stderr: '', friendly: 'Invalid rebase request.' });
    const r = requireCurrentRepo();
    return applyRebaseInteractive(r.workTreeRoot, onto, items);
  });
}

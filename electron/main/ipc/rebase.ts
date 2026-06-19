// electron/main/ipc/rebase.ts — interactive rebase IPC handlers.

import { ipcMain } from 'electron';
import { IPC, GitError, RebaseInteractivePlanInput, RebaseInteractiveApplyInput } from '@shared/ipc';
import { rebaseInteractivePlan, applyRebaseInteractive } from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerRebaseHandlers(): void {
  ipcMain.handle(IPC.BRANCH_REBASE_INTERACTIVE, async (_e, raw) => {
    const parsed = RebaseInteractivePlanInput.safeParse(raw);
    if (!parsed.success) throw new GitError({ code: 'BadInput', message: parsed.error.message, stdout: '', stderr: '', friendly: 'Specify a target branch.' });
    const r = requireCurrentRepo();
    return rebaseInteractivePlan(r.workTreeRoot, parsed.data.onto);
  });

  ipcMain.handle(IPC.REBASE_INTERACTIVE_APPLY, async (_e, raw) => {
    const parsed = RebaseInteractiveApplyInput.safeParse(raw);
    if (!parsed.success) throw new GitError({ code: 'BadInput', message: parsed.error.message, stdout: '', stderr: '', friendly: 'Invalid rebase request.' });
    const r = requireCurrentRepo();
    return applyRebaseInteractive(r.workTreeRoot, parsed.data.onto, parsed.data.items);
  });
}

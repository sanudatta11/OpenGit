// electron/main/ipc/compare.ts — branch comparison IPC handler.

import { ipcMain } from 'electron';
import { IPC, GitError, BranchCompareInput } from '@shared/ipc';
import { compareBranches } from '../git/compare';
import { requireCurrentRepo } from '../git/session';

export function registerCompareHandlers(): void {
  ipcMain.handle(IPC.BRANCH_COMPARE, async (_e, raw) => {
    const parsed = BranchCompareInput.safeParse(raw);
    if (!parsed.success) throw new GitError({ code: 'BadInput', message: parsed.error.message, stdout: '', stderr: '', friendly: 'Invalid compare input.' });
    const r = requireCurrentRepo();
    return compareBranches(r.workTreeRoot, parsed.data.branchA, parsed.data.branchB);
  });
}

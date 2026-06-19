// electron/main/ipc/branch.ts — branch checkout/create/delete/rename/set-upstream/reset IPC handlers.

import { ipcMain } from 'electron';
import {
  IPC, GitError,
  BranchCheckoutInput, BranchCreateInput, BranchDeleteInput,
  BranchRenameInput, BranchSetUpstreamInput, BranchResetInput,
} from '@shared/ipc';
import {
  checkoutBranch, createBranch, deleteBranch, renameBranch, setUpstream,
} from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerBranchHandlers(): void {
  ipcMain.handle(IPC.BRANCH_CHECKOUT, async (_e, raw) => {
    const parsed = BranchCheckoutInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return checkoutBranch(r.workTreeRoot, parsed.data.ref, parsed.data.create, parsed.data.force);
  });

  ipcMain.handle(IPC.BRANCH_CREATE, async (_e, raw) => {
    const parsed = BranchCreateInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return createBranch(r.workTreeRoot, parsed.data.name, parsed.data.start, parsed.data.checkout);
  });

  ipcMain.handle(IPC.BRANCH_DELETE, async (_e, raw) => {
    const parsed = BranchDeleteInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return deleteBranch(r.workTreeRoot, parsed.data.name, parsed.data.force);
  });

  ipcMain.handle(IPC.BRANCH_RENAME, async (_e, raw) => {
    const parsed = BranchRenameInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return renameBranch(r.workTreeRoot, parsed.data.oldName, parsed.data.newName);
  });

  ipcMain.handle(IPC.BRANCH_SET_UPSTREAM, async (_e, raw) => {
    const parsed = BranchSetUpstreamInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return setUpstream(r.workTreeRoot, parsed.data.branch, parsed.data.upstream);
  });

  ipcMain.handle(IPC.BRANCH_RESET, async (_e, raw) => {
    const parsed = BranchResetInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    const { resetBranch } = await import('../git/operations');
    return resetBranch(r.workTreeRoot, parsed.data.ref, parsed.data.mode);
  });
}

function badInput(message: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly: 'Invalid branch request.' });
}

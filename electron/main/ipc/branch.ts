// electron/main/ipc/branch.ts — branch checkout/create/delete/rename/set-upstream IPC handlers.

import { ipcMain } from 'electron';
import {
  IPC, GitError,
  BranchCheckoutInput, BranchCreateInput, BranchDeleteInput,
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
    const { oldName, newName } = raw as { oldName: string; newName: string };
    if (!oldName || !newName) throw badInput('Missing oldName or newName');
    const r = requireCurrentRepo();
    return renameBranch(r.workTreeRoot, oldName, newName);
  });

  ipcMain.handle(IPC.BRANCH_SET_UPSTREAM, async (_e, raw) => {
    const { branch, upstream } = raw as { branch: string; upstream: string };
    if (!branch || !upstream) throw badInput('Missing branch or upstream');
    const r = requireCurrentRepo();
    return setUpstream(r.workTreeRoot, branch, upstream);
  });
}

function badInput(message: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly: 'Invalid branch request.' });
}

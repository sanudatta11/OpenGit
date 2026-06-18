// electron/main/ipc/operations.ts — merge/rebase/cherry-pick/revert + in-progress abort/continue/skip IPC handlers.

import { ipcMain } from 'electron';
import {
  IPC, GitError,
  BranchMergeInput, BranchRebaseInput, CherryPickInput, OperationInput,
} from '@shared/ipc';
import {
  mergeBranch, rebaseBranch, cherryPick, revertCommits,
  abortOperation, continueOperation, skipOperation,
} from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerOperationsHandlers(): void {
  ipcMain.handle(IPC.BRANCH_MERGE, async (_e, raw) => {
    const parsed = BranchMergeInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return mergeBranch(r.workTreeRoot, {
      ref: parsed.data.ref,
      noFf: parsed.data.noFf,
      noCommit: parsed.data.noCommit,
      squash: parsed.data.squash,
    });
  });

  ipcMain.handle(IPC.BRANCH_REBASE, async (_e, raw) => {
    const parsed = BranchRebaseInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return rebaseBranch(r.workTreeRoot, {
      onto: parsed.data.onto,
      interactive: parsed.data.interactive,
    });
  });

  ipcMain.handle(IPC.COMMIT_CHERRY_PICK, async (_e, raw) => {
    const parsed = CherryPickInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return cherryPick(r.workTreeRoot, parsed.data.shas, parsed.data.noCommit);
  });

  ipcMain.handle(IPC.COMMIT_REVERT, async (_e, raw) => {
    const { shas, noCommit } = raw as { shas: string[]; noCommit?: boolean };
    if (!shas || !Array.isArray(shas) || shas.length === 0) throw badInput('Missing shas');
    const r = requireCurrentRepo();
    return revertCommits(r.workTreeRoot, shas, !!noCommit);
  });

  ipcMain.handle(IPC.OPERATION_ABORT, async (_e, raw) => {
    const parsed = OperationInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return abortOperation(r.workTreeRoot, parsed.data.kind);
  });

  ipcMain.handle(IPC.OPERATION_CONTINUE, async (_e, raw) => {
    const parsed = OperationInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return continueOperation(r.workTreeRoot, parsed.data.kind);
  });

  ipcMain.handle(IPC.OPERATION_SKIP, async (_e, raw) => {
    const parsed = OperationInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return skipOperation(r.workTreeRoot, parsed.data.kind);
  });
}

function badInput(message: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly: 'Invalid operation request.' });
}

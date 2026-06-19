// electron/main/ipc/commit.ts — commit create/amend IPC handler.

import { ipcMain } from 'electron';
import { IPC, CommitCreateInput, VerifyCommitInput, GitError } from '@shared/ipc';
import { createCommit, verifyCommit } from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerCommitHandlers(): void {
  ipcMain.handle(IPC.COMMIT_CREATE, async (_e, raw) => {
    const parsed = CommitCreateInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid commit request.',
      });
    }
    const r = requireCurrentRepo();
    return createCommit(r.workTreeRoot, {
      message: parsed.data.message,
      amend: parsed.data.amend,
      signoff: parsed.data.signoff,
      noVerify: parsed.data.noVerify,
      author: parsed.data.author,
    });
  });

  ipcMain.handle(IPC.COMMIT_VERIFY, async (_e, raw) => {
    const parsed = VerifyCommitInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid verify commit request.',
      });
    }
    const r = requireCurrentRepo();
    return verifyCommit(r.workTreeRoot, parsed.data.sha);
  });
}

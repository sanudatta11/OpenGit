// electron/main/ipc/remote.ts — fetch/pull/push IPC handlers.

import { ipcMain } from 'electron';
import { IPC, GitError, RemoteFetchInput, RemotePullInput, RemotePushInput } from '@shared/ipc';
import { fetchRemote, pullRemote, pushRemote } from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerRemoteHandlers(): void {
  ipcMain.handle(IPC.REMOTE_FETCH, async (_e, raw) => {
    const parsed = RemoteFetchInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return fetchRemote(r.workTreeRoot, parsed.data.remote, parsed.data.prune);
  });

  ipcMain.handle(IPC.REMOTE_PULL, async (_e, raw) => {
    const parsed = RemotePullInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return pullRemote(r.workTreeRoot, parsed.data.remote, parsed.data.branch, parsed.data.ffOnly);
  });

  ipcMain.handle(IPC.REMOTE_PUSH, async (_e, raw) => {
    const parsed = RemotePushInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    // Force-with-lease only — never raw --force.
    return pushRemote(
      r.workTreeRoot,
      parsed.data.remote,
      parsed.data.branch,
      parsed.data.forceWithLease,
      parsed.data.setUpstream,
    );
  });
}

function badInput(message: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly: 'Invalid remote request.' });
}

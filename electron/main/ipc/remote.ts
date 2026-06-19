// electron/main/ipc/remote.ts — remote fetch/pull/push IPC handlers + add/edit/remove.

import { ipcMain } from 'electron';
import {
  IPC, GitError,
  RemoteFetchInput, RemotePullInput, RemotePushInput,
} from '@shared/ipc';
import {
  fetchRemote, pullRemote, pushRemote,
} from '../git/operations';
import { requireCurrentRepo } from '../git/session';
import { gitRun } from '../git/client';

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
    return pullRemote(r.workTreeRoot, parsed.data.remote, parsed.data.branch, parsed.data.ffOnly, parsed.data.strategy);
  });

  ipcMain.handle(IPC.REMOTE_PUSH, async (_e, raw) => {
    const parsed = RemotePushInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return pushRemote(r.workTreeRoot, parsed.data.remote, parsed.data.branch, parsed.data.forceWithLease, parsed.data.setUpstream);
  });

  ipcMain.handle(IPC.REMOTE_ADD, async (_e, raw) => {
    const { name, url } = raw as { name: string; url: string } || {};
    if (!name || !url) throw badInput('Missing name or url');
    const r = requireCurrentRepo();
    const res = await gitRun({ cwd: r.workTreeRoot, args: ['remote', 'add', name, url], channel: 'remote:add', reject: false });
    return { success: res.ok, stdout: res.stdout, stderr: res.stderr };
  });

  ipcMain.handle(IPC.REMOTE_REMOVE, async (_e, raw) => {
    const { name } = raw as { name: string } || {};
    if (!name) throw badInput('Missing name');
    const r = requireCurrentRepo();
    const res = await gitRun({ cwd: r.workTreeRoot, args: ['remote', 'remove', name], channel: 'remote:remove', reject: false });
    return { success: res.ok, stdout: res.stdout, stderr: res.stderr };
  });

  ipcMain.handle(IPC.REMOTE_SET_URL, async (_e, raw) => {
    const { name, url, push } = raw as { name: string; url: string; push?: boolean } || {};
    if (!name || !url) throw badInput('Missing name or url');
    const r = requireCurrentRepo();
    const args = ['remote', 'set-url'];
    if (push) args.push('--push');
    args.push(name, url);
    const res = await gitRun({ cwd: r.workTreeRoot, args, channel: 'remote:setUrl', reject: false });
    return { success: res.ok, stdout: res.stdout, stderr: res.stderr };
  });
}

function badInput(message: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly: 'Invalid remote request.' });
}

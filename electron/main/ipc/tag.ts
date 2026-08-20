// electron/main/ipc/tag.ts — tag create/delete IPC handlers.

import { ipcMain } from 'electron';
import { IPC, GitError, TagCreateInput, TagDeleteInput } from '@shared/ipc';
import { createTag, deleteTag } from '../git/operations';
import { requireCurrentRepo } from '../git/session';

export function registerTagHandlers(): void {
  ipcMain.handle(IPC.TAG_CREATE, async (_e, raw) => {
    const parsed = TagCreateInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid tag create request.',
      });
    }
    const r = requireCurrentRepo();
    return createTag(r.workTreeRoot, {
      name: parsed.data.name,
      start: parsed.data.start,
      annotated: parsed.data.annotated,
      message: parsed.data.message,
      force: parsed.data.force,
    });
  });

  ipcMain.handle(IPC.TAG_DELETE, async (_e, raw) => {
    const parsed = TagDeleteInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid tag delete request.',
      });
    }
    const r = requireCurrentRepo();
    return deleteTag(r.workTreeRoot, parsed.data.name);
  });
}

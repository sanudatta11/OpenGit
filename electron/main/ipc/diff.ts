// electron/main/ipc/diff.ts — diff + file content IPC handlers. Phase 2 scope.

import { ipcMain } from 'electron';
import { IPC, DiffFileInput, CommitFilesInput, FileContentInput, GitError } from '@shared/ipc';
import { getDiff, getCommitFiles, getFileContent } from '../git/repo';
import { requireCurrentRepo } from '../git/session';

export function registerDiffHandlers(): void {
  ipcMain.handle(IPC.DIFF_FILE, async (_e, raw) => {
    const parsed = DiffFileInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid diff request.',
      });
    }
    const r = requireCurrentRepo();
    return getDiff(r.workTreeRoot, {
      path: parsed.data.path,
      ref: parsed.data.ref,
      base: parsed.data.base,
      ignoreWhitespace: parsed.data.ignoreWhitespace,
      contextLines: parsed.data.contextLines,
    });
  });

  ipcMain.handle(IPC.COMMIT_FILES, async (_e, raw) => {
    const parsed = CommitFilesInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid commit files request.',
      });
    }
    const r = requireCurrentRepo();
    return getCommitFiles(r.workTreeRoot, parsed.data.sha);
  });

  ipcMain.handle(IPC.FILE_CONTENT, async (_e, raw) => {
    const parsed = FileContentInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid file content request.',
      });
    }
    const r = requireCurrentRepo();
    return getFileContent(r.workTreeRoot, {
      path: parsed.data.path,
      ref: parsed.data.ref,
      maxBytes: parsed.data.maxBytes,
    });
  });
}

// electron/main/ipc/diff.ts — diff + file content IPC handlers.

import { ipcMain } from 'electron';
import { IPC, DiffFileInput, CommitFilesInput, FileContentInput, DiffCommitsInput, GitError } from '@shared/ipc';
import { getDiff, getCommitFiles, getFileContent } from '../git/repo';
import { requireCurrentRepo } from '../git/session';
import { gitText } from '../git/client';
import { parseUnifiedDiff } from '../git/parse';

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

  ipcMain.handle(IPC.DIFF_COMMITS, async (_e, raw) => {
    const parsed = DiffCommitsInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid diff commits request.',
      });
    }
    const r = requireCurrentRepo();
    return getDiffCommits(r.workTreeRoot, parsed.data.base, parsed.data.ref, parsed.data.paths);
  });
}

export interface DiffCommitFile {
  path: string;
  oldPath: string | null;
  additions: number;
  deletions: number;
  isBinary: boolean;
  isRename: boolean;
  isCopy: boolean;
  hunks: readonly import('@shared/git').Hunk[];
}

export async function getDiffCommits(
  workTree: string,
  base: string,
  ref: string,
  paths?: string[],
): Promise<DiffCommitFile[]> {
  const args = ['diff', '--no-color', '--name-only', '-z', `${base}..${ref}`];
  if (paths && paths.length > 0) args.push('--', ...paths);

  const names = await gitText({ cwd: workTree, args, channel: 'diff:commits' });
  const files = names.split('\0').filter(Boolean);
  if (files.length === 0) return [];

  const results: DiffCommitFile[] = [];
  for (const path of files) {
    const diffArgs = ['diff', '--no-color', `-U3`, `${base}..${ref}`, '--', path];
    const r = await gitText({ cwd: workTree, args: diffArgs, channel: 'diff:commits' });
    if (!r) {
      results.push({ path, oldPath: null, additions: 0, deletions: 0, isBinary: true, isRename: false, isCopy: false, hunks: [] });
      continue;
    }
    const diffResult = parseUnifiedDiff(r, path);
    results.push({
      path,
      oldPath: diffResult.oldPath,
      additions: diffResult.additions,
      deletions: diffResult.deletions,
      isBinary: diffResult.isBinary,
      isRename: diffResult.isRename,
      isCopy: diffResult.isCopy,
      hunks: diffResult.hunks,
    });
  }

  return results;
}

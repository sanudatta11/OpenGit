// electron/main/ipc/operations.ts — merge/rebase/cherry-pick/revert + in-progress abort/continue/skip IPC handlers.

import { ipcMain } from 'electron';
import {
  IPC, GitError,
  BranchMergeInput, BranchRebaseInput, CherryPickInput, OperationInput,
  MergePreviewInput, PullPreviewInput, PushPreviewInput, RebasePlanInput,
} from '@shared/ipc';
import {
  mergeBranch, rebaseBranch, cherryPick, revertCommits,
  abortOperation, continueOperation, skipOperation,
} from '../git/operations';
import { mergePreview, pullPreview, pushPreview, rebasePlan } from '../git/previews';
import { requireCurrentRepo } from '../git/session';

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gitRun } from '../git/client';

interface ConflictBlock {
  type: 'normal' | 'conflict';
  content?: string;
  current?: string;
  incoming?: string;
  ourLabel?: string;
  theirLabel?: string;
  id?: string;
}

export function parseConflictContent(content: string): ConflictBlock[] {
  const lines = content.split(/\r?\n/);
  const blocks: ConflictBlock[] = [];
  let currentLines: string[] = [];
  let mode: 'normal' | 'current' | 'incoming' = 'normal';
  let ourLabel = 'Current Change';
  let theirLabel = 'Incoming Change';
  let tempCurrent = '';
  let conflictCounter = 0;

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      if (currentLines.length > 0) {
        blocks.push({ type: 'normal', content: currentLines.join('\n') });
        currentLines = [];
      }
      mode = 'current';
      ourLabel = line.slice(7).trim() || 'Current Change';
    } else if (line.startsWith('=======') && mode === 'current') {
      tempCurrent = currentLines.join('\n');
      currentLines = [];
      mode = 'incoming';
    } else if (line.startsWith('>>>>>>>') && mode === 'incoming') {
      const tempIncoming = currentLines.join('\n');
      currentLines = [];
      theirLabel = line.slice(7).trim() || 'Incoming Change';
      conflictCounter++;
      blocks.push({
        type: 'conflict',
        current: tempCurrent,
        incoming: tempIncoming,
        ourLabel,
        theirLabel,
        id: `conflict-${conflictCounter}`,
      });
      mode = 'normal';
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    blocks.push({ type: 'normal', content: currentLines.join('\n') });
  }

  return blocks;
}

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

  ipcMain.handle(IPC.OPERATION_MERGE_PREVIEW, async (_e, raw) => {
    const parsed = MergePreviewInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return mergePreview(r.workTreeRoot, parsed.data.ref);
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

  ipcMain.handle(IPC.OPERATION_PULL_PREVIEW, async (_e, raw) => {
    const parsed = PullPreviewInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return pullPreview(r.workTreeRoot, parsed.data.remote, parsed.data.branch);
  });

  ipcMain.handle(IPC.OPERATION_PUSH_PREVIEW, async (_e, raw) => {
    const parsed = PushPreviewInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return pushPreview(r.workTreeRoot, parsed.data.remote, parsed.data.branch);
  });

  ipcMain.handle(IPC.OPERATION_REBASE_PLAN, async (_e, raw) => {
    const parsed = RebasePlanInput.safeParse(raw);
    if (!parsed.success) throw badInput(parsed.error.message);
    const r = requireCurrentRepo();
    return rebasePlan(r.workTreeRoot, parsed.data.onto);
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

  ipcMain.handle(IPC.CONFLICT_FILE, async (_e, raw) => {
    const { path } = raw as { path: string };
    if (!path) throw badInput('Missing path');
    const r = requireCurrentRepo();
    const fsPath = join(r.workTreeRoot, path);
    if (!existsSync(fsPath)) throw badInput('File not found');
    const content = readFileSync(fsPath, 'utf8');
    const blocks = parseConflictContent(content);
    return { path, blocks };
  });

  ipcMain.handle(IPC.CONFLICT_RESOLVE, async (_e, raw) => {
    const { path, content } = raw as { path: string; content: string };
    if (!path || content === undefined) throw badInput('Missing path or content');
    const r = requireCurrentRepo();
    const fsPath = join(r.workTreeRoot, path);
    writeFileSync(fsPath, content, 'utf8');
    const stage = await gitRun({
      cwd: r.workTreeRoot,
      args: ['add', path],
      channel: 'conflict:resolve',
      reject: false,
    });
    return { success: stage.ok, stdout: stage.stdout, stderr: stage.stderr };
  });
}

function badInput(message: string): GitError {
  return new GitError({ code: 'BadInput', message, stdout: '', stderr: '', friendly: 'Invalid operation request.' });
}

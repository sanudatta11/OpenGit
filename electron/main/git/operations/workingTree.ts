import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ConflictVersionsResult, WriteResult } from '@shared/ipc';
import type { Worktree } from '@shared/git';
import { gitRun } from '../client';
import { parseWorktrees } from '../parse';
import { getStatus } from '../repo';
import { toWriteResult } from './commandResult';

async function runIndexWrite(
  workTree: string,
  args: readonly string[],
  channel: string,
): Promise<WriteResult> {
  const result = await gitRun({ cwd: workTree, args, channel, reject: false });
  return toWriteResult(result, { changedRefs: ['INDEX'] });
}

export function stagePaths(workTree: string, paths: readonly string[]): Promise<WriteResult> {
  return runIndexWrite(workTree, ['add', '--', ...paths], 'workingTree:stage');
}

export function stageAll(workTree: string): Promise<WriteResult> {
  return runIndexWrite(workTree, ['add', '--all'], 'workingTree:stage');
}

export function unstagePaths(workTree: string, paths: readonly string[]): Promise<WriteResult> {
  return runIndexWrite(workTree, ['reset', 'HEAD', '--', ...paths], 'workingTree:unstage');
}

export function unstageAll(workTree: string): Promise<WriteResult> {
  return runIndexWrite(workTree, ['reset', 'HEAD'], 'workingTree:unstage');
}

export function discardPaths(workTree: string, paths: readonly string[]): Promise<WriteResult> {
  return runIndexWrite(workTree, ['checkout', '--', ...paths], 'workingTree:discard');
}

export async function discardUntracked(workTree: string, paths: readonly string[]): Promise<WriteResult> {
  const result = await gitRun({
    cwd: workTree,
    args: ['clean', '-f', '--', ...paths],
    channel: 'workingTree:discard',
    reject: false,
  });
  return toWriteResult(result);
}

export async function discardAllUnstaged(workTree: string, gitDir: string): Promise<WriteResult> {
  const status = await getStatus(workTree, gitDir);
  const tracked = status.entries
    .filter((entry) => entry.unstaged && entry.kind !== 'untracked' && entry.kind !== 'unmerged')
    .map((entry) => entry.path);
  const untracked = status.entries
    .filter((entry) => entry.kind === 'untracked')
    .map((entry) => entry.path);

  let stdout = '';
  let stderr = '';
  if (tracked.length > 0) {
    const restored = await gitRun({
      cwd: workTree,
      args: ['restore', '--worktree', '--', ...tracked],
      channel: 'workingTree:discard',
      reject: false,
    });
    stdout += restored.stdout;
    stderr += restored.stderr;
    if (!restored.ok) return toWriteResult({ ...restored, stdout, stderr });
  }

  if (untracked.length > 0) {
    const cleaned = await gitRun({
      cwd: workTree,
      args: ['clean', '-f', '--', ...untracked],
      channel: 'workingTree:discard',
      reject: false,
    });
    stdout += cleaned.stdout;
    stderr += cleaned.stderr;
    if (!cleaned.ok) {
      return toWriteResult({ ...cleaned, stdout, stderr }, { requiresRefresh: tracked.length > 0 });
    }
  }

  return toWriteResult(
    { ok: true, stdout, stderr, exitCode: 0 },
    { requiresRefresh: tracked.length + untracked.length > 0 },
  );
}

async function applyIndexPatch(
  workTree: string,
  patch: string,
  reverse: boolean,
  channel: string,
): Promise<WriteResult> {
  const args = ['apply', '--cached'];
  if (reverse) args.push('--reverse');
  args.push('-');
  const result = await gitRun({ cwd: workTree, args, input: patch, channel, reject: false });
  return toWriteResult(result, { changedRefs: ['INDEX'] });
}

export function stageHunks(workTree: string, path: string, patch: string): Promise<WriteResult> {
  void path;
  return applyIndexPatch(workTree, patch, false, 'workingTree:stageHunks');
}

export function unstageHunks(workTree: string, path: string, patch: string): Promise<WriteResult> {
  void path;
  return applyIndexPatch(workTree, patch, true, 'workingTree:unstageHunks');
}

async function gitShowStage(workTree: string, stage: number, path: string): Promise<string> {
  const result = await gitRun({
    cwd: workTree,
    args: ['show', `:${stage}:${path}`],
    channel: 'conflict:versions',
    reject: false,
  });
  return result.ok ? result.stdout : '';
}

export async function getConflictVersions(
  workTree: string,
  path: string,
): Promise<ConflictVersionsResult> {
  const [ours, theirs] = await Promise.all([
    gitShowStage(workTree, 2, path),
    gitShowStage(workTree, 3, path),
  ]);
  return { ours, theirs, merged: readFileSync(join(workTree, path), 'utf8') };
}

export async function listWorktrees(workTree: string): Promise<Worktree[]> {
  const result = await gitRun({
    cwd: workTree,
    args: ['worktree', 'list', '--porcelain'],
    channel: 'worktree:list',
    reject: false,
  });
  return result.ok && result.stdout ? parseWorktrees(result.stdout) : [];
}

export interface WorktreeCreateOptions {
  path: string;
  branch?: string;
  start: string;
  lock?: string;
}

export async function createWorktree(
  workTree: string,
  opts: WorktreeCreateOptions,
): Promise<WriteResult> {
  const args = ['worktree', 'add'];
  args.push(...(opts.branch ? ['-b', opts.branch] : ['--detach']));
  if (opts.lock) args.push('--lock');
  args.push(opts.path, opts.start);
  const result = await gitRun({ cwd: workTree, args, channel: 'worktree:create', reject: false });
  return toWriteResult(result, {
    changedRefs: opts.branch ? [`refs/heads/${opts.branch}`] : [],
  });
}

export async function removeWorktree(
  workTree: string,
  path: string,
  force: boolean,
): Promise<WriteResult> {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(path);
  const result = await gitRun({ cwd: workTree, args, channel: 'worktree:remove', reject: false });
  return toWriteResult(result);
}

export async function pruneWorktrees(workTree: string): Promise<WriteResult> {
  const result = await gitRun({
    cwd: workTree,
    args: ['worktree', 'prune', '--verbose'],
    channel: 'worktree:prune',
    reject: false,
  });
  return toWriteResult(result);
}

export async function lockWorktree(
  workTree: string,
  path: string,
  reason?: string,
): Promise<WriteResult> {
  const args = ['worktree', 'lock'];
  if (reason) args.push('--reason', reason);
  args.push(path);
  const result = await gitRun({ cwd: workTree, args, channel: 'worktree:lock', reject: false });
  return toWriteResult(result);
}

export async function unlockWorktree(workTree: string, path: string): Promise<WriteResult> {
  const result = await gitRun({
    cwd: workTree,
    args: ['worktree', 'unlock', path],
    channel: 'worktree:unlock',
    reject: false,
  });
  return toWriteResult(result);
}

export async function removeWorktreeAndBranch(
  workTree: string,
  path: string,
  branchName: string,
  force: boolean,
): Promise<WriteResult> {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(path);
  const result = await gitRun({
    cwd: workTree,
    args,
    channel: 'worktree:removeAndDeleteBranch',
    reject: false,
  });
  if (result.ok) {
    await gitRun({
      cwd: workTree,
      args: ['branch', '-D', branchName],
      channel: 'worktree:removeAndDeleteBranch',
      reject: false,
    });
  }
  return toWriteResult(result, {
    changedRefs: (ok) => ok ? [`refs/heads/${branchName}`] : [],
  });
}

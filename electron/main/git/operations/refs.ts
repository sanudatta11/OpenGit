import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  RebaseInteractivePlan,
  RebaseInteractivePlanItem,
  RebaseResultData,
  WriteResult,
} from '@shared/ipc';
import type { OperationKind } from '@shared/git';
import { gitRun, gitText } from '../client';
import { toWriteResult } from './commandResult';
import { probeState } from './state';

export async function checkoutBranch(
  workTree: string,
  ref: string,
  create?: boolean,
  force?: boolean,
): Promise<WriteResult> {
  const args = ['checkout'];
  if (create) args.push('-b');
  if (force) args.push('--force');
  args.push(ref);
  const result = await gitRun({ cwd: workTree, args, channel: 'branch:checkout', reject: false });
  return toWriteResult(result);
}

export async function createBranch(
  workTree: string,
  name: string,
  start: string,
  checkout: boolean,
): Promise<WriteResult> {
  const args = checkout ? ['checkout', '-b', name, start] : ['branch', name, start];
  const result = await gitRun({ cwd: workTree, args, channel: 'branch:create', reject: false });
  return toWriteResult(result, {
    changedRefs: checkout ? ['HEAD', `refs/heads/${name}`] : [`refs/heads/${name}`],
  });
}

export async function deleteBranch(
  workTree: string,
  name: string,
  force: boolean,
): Promise<WriteResult> {
  const result = await gitRun({
    cwd: workTree,
    args: ['branch', force ? '-D' : '-d', name],
    channel: 'branch:delete',
    reject: false,
  });
  return toWriteResult(result, { changedRefs: [`refs/heads/${name}`] });
}

export interface TagCreateOptions {
  name: string;
  start?: string;
  annotated?: boolean;
  message?: string;
  force?: boolean;
}

export async function createTag(
  workTree: string,
  opts: TagCreateOptions,
): Promise<WriteResult> {
  const args = ['tag'];
  if (opts.force) args.push('-f');
  if (opts.annotated) {
    args.push('-a', opts.name, '-m', opts.message ?? opts.name);
  } else {
    args.push(opts.name);
  }
  if (opts.start) args.push(opts.start);
  const result = await gitRun({
    cwd: workTree,
    args,
    channel: 'tag:create',
    reject: false,
  });
  return toWriteResult(result, { changedRefs: [`refs/tags/${opts.name}`] });
}

export async function deleteTag(workTree: string, name: string): Promise<WriteResult> {
  const result = await gitRun({
    cwd: workTree,
    args: ['tag', '-d', name],
    channel: 'tag:delete',
    reject: false,
  });
  return toWriteResult(result, { changedRefs: [`refs/tags/${name}`] });
}

export async function renameBranch(
  workTree: string,
  oldName: string,
  newName: string,
): Promise<WriteResult> {
  const result = await gitRun({
    cwd: workTree,
    args: ['branch', '-m', oldName, newName],
    channel: 'branch:rename',
    reject: false,
  });
  return toWriteResult(result, {
    changedRefs: [`refs/heads/${oldName}`, `refs/heads/${newName}`],
  });
}

export async function setUpstream(
  workTree: string,
  branch: string,
  upstream: string,
): Promise<WriteResult> {
  const result = await gitRun({
    cwd: workTree,
    args: ['branch', '--set-upstream-to', upstream, branch],
    channel: 'branch:setUpstream',
    reject: false,
  });
  return toWriteResult(result, { changedRefs: [`refs/heads/${branch}`] });
}

export interface MergeOptions {
  ref: string;
  noFf?: boolean;
  noCommit?: boolean;
  squash?: boolean;
}

async function conflictPaths(workTree: string, channel: string): Promise<string[]> {
  const result = await gitRun({
    cwd: workTree,
    args: ['diff', '--name-only', '--diff-filter=U', '-z'],
    channel,
    reject: false,
  });
  return result.ok ? result.stdout.split('\0').filter(Boolean) : [];
}

export async function mergeBranch(
  workTree: string,
  opts: MergeOptions,
): Promise<WriteResult<{ conflicts: readonly string[]; fastForward: boolean }>> {
  const args = ['merge'];
  if (opts.noFf) args.push('--no-ff');
  if (opts.noCommit) args.push('--no-commit');
  if (opts.squash) args.push('--squash');
  args.push(opts.ref);
  const result = await gitRun({ cwd: workTree, args, channel: 'branch:merge', reject: false });
  const hasConflicts = /CONFLICT|Automatic merge failed/i.test(
    `${result.stderr}\n${result.stdout}`,
  );
  return toWriteResult(result, {
    data: {
      conflicts: hasConflicts ? await conflictPaths(workTree, 'branch:merge') : [],
      fastForward: /Fast-forward/i.test(result.stdout),
    },
    changedRefs: (ok) => ok ? ['HEAD'] : [],
    requiresRefresh: true,
    state: hasConflicts ? await probeState(workTree, join(workTree, '.git')) : undefined,
  });
}

export interface RebaseOptions {
  onto: string;
  interactive?: boolean;
}

function readRebaseProgress(workTree: string): { step: number | null; total: number | null } {
  const gitDir = join(workTree, '.git');
  const rebaseDir = existsSync(join(gitDir, 'rebase-merge'))
    ? join(gitDir, 'rebase-merge')
    : join(gitDir, 'rebase-apply');
  let step: number | null = null;
  let total: number | null = null;
  try {
    if (existsSync(join(rebaseDir, 'msgnum'))) {
      step = Number.parseInt(readFileSync(join(rebaseDir, 'msgnum'), 'utf8').trim(), 10);
    }
    if (existsSync(join(rebaseDir, 'end'))) {
      total = Number.parseInt(readFileSync(join(rebaseDir, 'end'), 'utf8').trim(), 10);
    }
  } catch {
    // Progress metadata is best-effort.
  }
  return { step, total };
}

async function translateRebase(
  workTree: string,
  channel: string,
  result: Awaited<ReturnType<typeof gitRun>>,
  includeProgress = true,
): Promise<WriteResult<RebaseResultData>> {
  const hasConflicts = /CONFLICT|could not apply|Merge conflict/i.test(
    `${result.stderr}\n${result.stdout}`,
  );
  const progress = hasConflicts && includeProgress
    ? readRebaseProgress(workTree)
    : { step: null, total: null };
  return toWriteResult(result, {
    data: {
      conflicts: hasConflicts ? await conflictPaths(workTree, channel) : [],
      ...progress,
    },
    changedRefs: (ok) => ok ? ['HEAD'] : [],
    requiresRefresh: true,
    state: hasConflicts ? await probeState(workTree, join(workTree, '.git')) : undefined,
  });
}

export async function rebaseBranch(
  workTree: string,
  opts: RebaseOptions,
): Promise<WriteResult<{ conflicts: readonly string[]; step: number | null; total: number | null }>> {
  const args = ['rebase'];
  if (opts.interactive) args.push('-i');
  args.push(opts.onto);
  const result = await gitRun({ cwd: workTree, args, channel: 'branch:rebase', reject: false });
  return translateRebase(workTree, 'branch:rebase', result);
}

export async function rebaseInteractivePlan(
  workTree: string,
  onto: string,
): Promise<RebaseInteractivePlan> {
  const result = await gitRun({
    cwd: workTree,
    args: ['log', '--pretty=format:%H%x1f%an%x1f%s', `${onto}..HEAD`],
    channel: 'rebase:interactive',
    reject: false,
  });
  const items: RebaseInteractivePlanItem[] = result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .reverse()
    .map((line, index) => {
      const [sha = '', author = '', subject = ''] = line.split('\x1f');
      return { id: `todo-${index}`, action: 'pick', sha, subject, author };
    });
  const branchResult = await gitRun({
    cwd: workTree,
    args: ['branch', '--show-current'],
    channel: 'rebase:interactive',
    reject: false,
  });
  return {
    onto,
    currentBranch: branchResult.ok ? branchResult.stdout.trim() : null,
    items,
  };
}

export async function applyRebaseInteractive(
  workTree: string,
  onto: string,
  items: { action: string; sha: string }[],
): Promise<WriteResult<RebaseResultData>> {
  const tempDir = mkdtempSync(join(tmpdir(), 'opengit-rebase-'));
  const todoPath = join(tempDir, 'git-rebase-todo');
  writeFileSync(
    todoPath,
    `${items.map((item) => `${item.action} ${item.sha}`).join('\n')}\n`,
    'utf8',
  );
  const editorCommand = `cp "${todoPath.replace(/\\/g, '/')}"`;
  try {
    const result = await gitRun({
      cwd: workTree,
      args: ['rebase', '-i', onto],
      channel: 'branch:rebaseInteractive',
      reject: false,
      env: { GIT_SEQUENCE_EDITOR: editorCommand, GIT_EDITOR: editorCommand },
    });
    return translateRebase(workTree, 'branch:rebaseInteractive', result, false);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function operationSubcommand(kind: OperationKind): string {
  switch (kind) {
    case 'merge': return 'merge';
    case 'rebase': return 'rebase';
    case 'cherry-pick': return 'cherry-pick';
    case 'revert': return 'revert';
    case 'bisect': return 'bisect';
  }
}

export async function abortOperation(
  workTree: string,
  kind: OperationKind,
): Promise<WriteResult> {
  const result = await gitRun({
    cwd: workTree,
    args: [operationSubcommand(kind), '--abort'],
    channel: 'operation:abort',
    reject: false,
  });
  return toWriteResult(result, { changedRefs: ['HEAD'], requiresRefresh: true });
}

async function advanceOperation(
  workTree: string,
  kind: OperationKind,
  action: 'continue' | 'skip',
): Promise<WriteResult> {
  const result = await gitRun({
    cwd: workTree,
    args: [operationSubcommand(kind), `--${action}`],
    channel: `operation:${action}`,
    reject: false,
  });
  const stillInProgress = /CONFLICT|Merge conflict|could not apply/i.test(
    `${result.stderr}\n${result.stdout}`,
  );
  return toWriteResult(result, {
    changedRefs: (ok) => ok ? ['HEAD'] : [],
    requiresRefresh: true,
    state: stillInProgress ? await probeState(workTree, join(workTree, '.git')) : undefined,
  });
}

export function continueOperation(workTree: string, kind: OperationKind): Promise<WriteResult> {
  return advanceOperation(workTree, kind, 'continue');
}

export function skipOperation(workTree: string, kind: OperationKind): Promise<WriteResult> {
  return advanceOperation(workTree, kind, 'skip');
}

export async function resetBranch(
  workTree: string,
  ref: string,
  mode: 'soft' | 'mixed' | 'hard' | 'keep',
): Promise<WriteResult> {
  const args = ['reset'];
  if (mode !== 'mixed') args.push(`--${mode}`);
  args.push(ref);
  const result = await gitRun({ cwd: workTree, args, channel: 'branch:reset', reject: false });
  return toWriteResult(result, { changedRefs: ['HEAD'] });
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function findReflogSha(workTree: string, branch: string): Promise<string | null> {
  try {
    const reflog = await gitText({
      cwd: workTree,
      args: ['reflog', '--no-abbrev', '--format=%H %gs'],
      channel: 'operation:undo',
    });
    const patterns = [
      new RegExp(`moving from .* to ${escapeRegex(branch)}\\s*$`),
      new RegExp(`Branch: created .* ${escapeRegex(branch)}$`),
    ];
    for (const pattern of patterns) {
      for (const line of reflog.split('\n')) {
        if (pattern.test(line)) return line.split(' ')[0]!;
      }
    }
  } catch {
    // Reflog recovery is best-effort.
  }
  return null;
}

export async function undoAction(
  workTree: string,
  action: { kind: string; branch?: string; sha?: string },
): Promise<WriteResult> {
  let args: string[];
  switch (action.kind) {
    case 'commit':
      args = ['reset', '--soft', 'HEAD@{1}'];
      break;
    case 'merge':
      args = ['reset', '--merge', 'ORIG_HEAD'];
      break;
    case 'branch-create':
      args = action.branch ? ['branch', '-D', action.branch] : ['reset', '--hard', 'ORIG_HEAD'];
      break;
    case 'branch-delete': {
      const sha = action.branch ? await findReflogSha(workTree, action.branch) : null;
      args = action.branch && sha
        ? ['branch', action.branch, sha]
        : ['reset', '--hard', 'ORIG_HEAD'];
      break;
    }
    case 'stash-apply':
    case 'stash-pop':
      args = ['reset', '--hard', 'HEAD'];
      break;
    default:
      args = ['reset', '--hard', 'ORIG_HEAD'];
  }
  const result = await gitRun({ cwd: workTree, args, channel: 'operation:undo', reject: false });
  return toWriteResult(result, {
    changedRefs: (ok) => ok ? ['HEAD'] : [],
  });
}

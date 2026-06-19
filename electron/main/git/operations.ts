// electron/main/git/operations.ts — write operations (stage/unstage/discard/commit/branch/remote/stash/merge/rebase/cherry-pick).
// Each returns a WriteResult. See shared/ipc.ts for the envelope.

import { gitRun, gitText } from './client';
import type { ConflictVersionsResult, WriteResult, RebaseResultData } from '@shared/ipc';
import type { RebaseInteractivePlanItem, RebaseInteractivePlan } from '@shared/ipc';
import type { InProgressState, StashEntry, OperationKind, Worktree } from '@shared/git';
import { parseInProgressState, withConflicts, parseStashList, STASH_LIST_FORMAT, parseWorktrees } from './parse';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

// ─────────────────────────────────────────────────────────────────────────────
// Working tree
// ─────────────────────────────────────────────────────────────────────────────

export async function stagePaths(workTree: string, paths: readonly string[]): Promise<WriteResult> {
  const r = await gitRun({
    cwd: workTree,
    args: ['add', '--', ...paths],
    channel: 'workingTree:stage',
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['INDEX'],
    requiresRefresh: r.ok,
  };
}

export async function stageAll(workTree: string): Promise<WriteResult> {
  const r = await gitRun({
    cwd: workTree,
    args: ['add', '--all'],
    channel: 'workingTree:stage',
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['INDEX'],
    requiresRefresh: r.ok,
  };
}

export async function unstagePaths(workTree: string, paths: readonly string[]): Promise<WriteResult> {
  // `git reset HEAD -- <paths>` is the safest unstage (works in older git too).
  const r = await gitRun({
    cwd: workTree,
    args: ['reset', 'HEAD', '--', ...paths],
    channel: 'workingTree:unstage',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['INDEX'],
    requiresRefresh: r.ok,
  };
}

export async function unstageAll(workTree: string): Promise<WriteResult> {
  const r = await gitRun({
    cwd: workTree,
    args: ['reset', 'HEAD'],
    channel: 'workingTree:unstage',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['INDEX'],
    requiresRefresh: r.ok,
  };
}

export async function discardPaths(workTree: string, paths: readonly string[]): Promise<WriteResult> {
  // `git checkout -- <paths>` discards worktree changes for tracked files.
  // For untracked files, caller should use `git clean -f -- <paths>`.
  // We split: tracked → checkout, untracked → clean.
  // Caller passes already-classified paths; here we just checkout.
  const r = await gitRun({
    cwd: workTree,
    args: ['checkout', '--', ...paths],
    channel: 'workingTree:discard',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['INDEX'],
    requiresRefresh: r.ok,
  };
}

export async function discardUntracked(workTree: string, paths: readonly string[]): Promise<WriteResult> {
  // `git clean -f -- <paths>` removes untracked files.
  const r = await gitRun({
    cwd: workTree,
    args: ['clean', '-f', '--', ...paths],
    channel: 'workingTree:discard',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: [],
    requiresRefresh: r.ok,
  };
}

export async function stageHunks(
  workTree: string,
  path: string,
  patch: string,
): Promise<WriteResult> {
  // Apply a unified-diff patch to the index via stdin.
  // `git apply --cached -` reads patch from stdin.
  const r = await gitRun({
    cwd: workTree,
    args: ['apply', '--cached', '-'],
    stdin: patch,
    channel: 'workingTree:stageHunks',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['INDEX'],
    requiresRefresh: r.ok,
  };
  void path; // path is embedded in the patch
}

export async function unstageHunks(
  workTree: string,
  path: string,
  patch: string,
): Promise<WriteResult> {
  // Reverse-apply patch to the index: `git apply --cached --reverse -`.
  const r = await gitRun({
    cwd: workTree,
    args: ['apply', '--cached', '--reverse', '-'],
    stdin: patch,
    channel: 'workingTree:unstageHunks',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['INDEX'],
    requiresRefresh: r.ok,
  };
  void path;
}

// ─────────────────────────────────────────────────────────────────────────────
// Commit
// ─────────────────────────────────────────────────────────────────────────────

export interface CommitOptions {
  message: string;
  amend?: boolean;
  signoff?: boolean;
  noVerify?: boolean;
  author?: { name: string; email: string };
}

export async function createCommit(workTree: string, opts: CommitOptions): Promise<WriteResult<{ sha: string }>> {
  const args = ['commit', '-m', opts.message];
  if (opts.amend) args.push('--amend');
  if (opts.signoff) args.push('--signoff');
  if (opts.noVerify) args.push('--no-verify');
  if (opts.author) args.push('--author', `${opts.author.name} <${opts.author.email}>`);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'commit:create',
  });

  if (!r.ok) {
    return {
      success: false,
      stdout: r.stdout,
      stderr: r.stderr,
      changedRefs: [],
      requiresRefresh: false,
    };
  }

  // Get the new commit sha.
  let sha = '';
  try {
    sha = (await gitText({
      cwd: workTree,
      args: ['rev-parse', 'HEAD'],
      channel: 'commit:create',
    })).trim();
  } catch {
    // ignore — commit succeeded, sha lookup is best-effort
  }

  return {
    success: true,
    data: { sha },
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['HEAD'],
    requiresRefresh: true,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch
// ─────────────────────────────────────────────────────────────────────────────

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

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'branch:checkout',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: [],
    requiresRefresh: r.ok,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict versions (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

export async function getConflictVersions(
  workTree: string,
  path: string,
): Promise<ConflictVersionsResult> {
  const [ours, theirs] = await Promise.all([
    gitShowStage(workTree, 2, path),
    gitShowStage(workTree, 3, path),
  ]);
  const merged = readFileSync(join(workTree, path), 'utf8');
  return { ours, theirs, merged };
}

async function gitShowStage(workTree: string, stage: number, path: string): Promise<string> {
  const r = await gitRun({
    cwd: workTree,
    args: ['show', `:${stage}:${path}`],
    channel: 'conflict:versions',
    reject: false,
  });
  return r.ok ? r.stdout : '';
}

export async function createBranch(
  workTree: string,
  name: string,
  start: string,
  checkout: boolean,
): Promise<WriteResult> {
  const args = checkout
    ? ['checkout', '-b', name, start]
    : ['branch', name, start];

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'branch:create',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: checkout ? ['HEAD', `refs/heads/${name}`] : [`refs/heads/${name}`],
    requiresRefresh: r.ok,
  };
}

export async function deleteBranch(
  workTree: string,
  name: string,
  force: boolean,
): Promise<WriteResult> {
  const r = await gitRun({
    cwd: workTree,
    args: ['branch', force ? '-D' : '-d', name],
    channel: 'branch:delete',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: [`refs/heads/${name}`],
    requiresRefresh: r.ok,
  };
}

export async function renameBranch(
  workTree: string,
  oldName: string,
  newName: string,
): Promise<WriteResult> {
  const r = await gitRun({
    cwd: workTree,
    args: ['branch', '-m', oldName, newName],
    channel: 'branch:rename',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: [`refs/heads/${oldName}`, `refs/heads/${newName}`],
    requiresRefresh: r.ok,
  };
}

export async function setUpstream(
  workTree: string,
  branch: string,
  upstream: string,
): Promise<WriteResult> {
  const r = await gitRun({
    cwd: workTree,
    args: ['branch', '--set-upstream-to', upstream, branch],
    channel: 'branch:setUpstream',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: [`refs/heads/${branch}`],
    requiresRefresh: r.ok,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Remote
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchRemote(
  workTree: string,
  remote: string,
  prune: boolean,
): Promise<WriteResult<{ fetched: number; pruned: readonly string[] }>> {
  const args = ['fetch'];
  if (prune) args.push('--prune');
  args.push(remote);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'remote:fetch',
    reject: false,
  });

  if (!r.ok) {
    return {
      success: false,
      stdout: r.stdout,
      stderr: r.stderr,
      changedRefs: [],
      requiresRefresh: false,
    };
  }

  // Count fetched refs from stderr (git fetch prints progress to stderr).
  const fetched = (r.stderr.match(/->\s/g) ?? []).length;
  const pruned = (r.stderr.match(/\[deleted\]\s+\S+\s+->\s+(\S+)/g) ?? []).map((m) => m);

  return {
    success: true,
    data: { fetched, pruned },
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['refs/remotes'],
    requiresRefresh: true,
  };
}

export async function pullRemote(
  workTree: string,
  remote: string,
  branch: string | undefined,
  ffOnly: boolean,
  strategy?: 'merge' | 'rebase' | 'ff-only',
): Promise<WriteResult> {
  const args = ['pull'];
  const resolvedStrategy = strategy ?? (ffOnly ? 'ff-only' : undefined);
  if (resolvedStrategy === 'ff-only') args.push('--ff-only');
  if (resolvedStrategy === 'rebase') args.push('--rebase');
  if (resolvedStrategy === 'merge') args.push('--no-rebase');
  args.push(remote);
  if (branch) args.push(branch);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'remote:pull',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['HEAD', 'refs/remotes'],
    requiresRefresh: r.ok,
  };
}

export async function pushRemote(
  workTree: string,
  remote: string,
  branch: string | undefined,
  forceWithLease: boolean,
  setUpstream: boolean,
): Promise<WriteResult<{ pushed: number; rejected: boolean; remoteHead: string | null }>> {
  const args = ['push'];
  if (forceWithLease) args.push('--force-with-lease');
  if (setUpstream) args.push('-u');
  args.push(remote);
  if (branch) args.push(branch);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'remote:push',
    reject: false,
  });

  const rejected = !r.ok && /!\[rejected\]|non-fast-forward/i.test(r.stderr);
  let remoteHead: string | null = null;
  if (r.ok && branch) {
    try {
      remoteHead = (await gitText({
        cwd: workTree,
        args: ['rev-parse', `${remote}/${branch}`],
        channel: 'remote:push',
      })).trim();
    } catch {
      // best-effort
    }
  }
  const pushed = r.ok ? (r.stderr.match(/->\s/g) ?? []).length : 0;

  return {
    success: r.ok,
    data: { pushed, rejected, remoteHead },
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: r.ok ? ['refs/remotes'] : [],
    requiresRefresh: r.ok,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// In-progress state helper (used by write ops that may produce conflicts)
// ─────────────────────────────────────────────────────────────────────────────

export async function probeState(
  workTree: string,
  gitDir: string,
): Promise<readonly InProgressState[]> {
  const base = parseInProgressState(gitDir, workTree);
  let conflicts: string[] = [];
  if (base.length > 0) {
    const r = await gitRun({
      cwd: workTree,
      args: ['diff', '--name-only', '--diff-filter=U', '-z'],
      channel: 'repo:state',
      reject: false,
    });
    if (r.ok) conflicts = r.stdout.split('\0').filter((p) => p.length > 0);
  }
  return withConflicts(base, conflicts);
}

// ─────────────────────────────────────────────────────────────────────────────
// Stash
// ─────────────────────────────────────────────────────────────────────────────

export async function listStashes(workTree: string): Promise<StashEntry[]> {
  const r = await gitRun({
    cwd: workTree,
    args: ['stash', 'list', `--format=${STASH_LIST_FORMAT}`],
    channel: 'stash:list',
    reject: false,
  });
  if (!r.ok || !r.stdout) return [];
  return parseStashList(r.stdout);
}

export interface StashCreateOptions {
  message?: string;
  includeUntracked?: boolean;
  keepIndex?: boolean;
}

export async function createStash(workTree: string, opts: StashCreateOptions): Promise<WriteResult> {
  const args = ['stash', 'push'];
  if (opts.message) args.push('-m', opts.message);
  if (opts.includeUntracked) args.push('--include-untracked');
  if (opts.keepIndex) args.push('--keep-index');

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'stash:create',
    reject: false,
  });

  // "No local changes to save" → exit 0 but nothing saved.
  const noChanges = /no local changes/i.test(r.stdout) || /No local changes/i.test(r.stderr);
  return {
    success: r.ok,
    data: { noChanges },
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: r.ok && !noChanges ? ['refs/stash'] : [],
    requiresRefresh: r.ok,
  };
}

export async function applyStash(
  workTree: string,
  ref: string,
  keepIndex: boolean,
): Promise<WriteResult> {
  const args = ['stash', 'apply'];
  if (keepIndex) args.push('--index');
  args.push(ref);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'stash:apply',
    reject: false,
  });

  // Conflicts during apply: git exits non-zero and prints CONFLICT lines.
  const hasConflicts = /CONFLICT|Merge conflict/i.test(r.stderr) || /CONFLICT/i.test(r.stdout);

  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: [],
    requiresRefresh: true,
    state: hasConflicts ? await probeState(workTree, join(workTree, '.git')) : undefined,
  };
}

export async function popStash(
  workTree: string,
  ref: string,
  keepIndex: boolean,
): Promise<WriteResult> {
  const args = ['stash', 'pop'];
  if (keepIndex) args.push('--index');
  args.push(ref);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'stash:pop',
    reject: false,
  });

  const hasConflicts = /CONFLICT|Merge conflict/i.test(r.stderr) || /CONFLICT/i.test(r.stdout);
  // On conflict, stash is NOT dropped. On success, stash@{n} is dropped.

  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: r.ok ? ['refs/stash'] : [],
    requiresRefresh: true,
    state: hasConflicts ? await probeState(workTree, join(workTree, '.git')) : undefined,
  };
}

export async function dropStash(workTree: string, ref: string): Promise<WriteResult> {
  const r = await gitRun({
    cwd: workTree,
    args: ['stash', 'drop', ref],
    channel: 'stash:drop',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['refs/stash'],
    requiresRefresh: r.ok,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Merge
// ─────────────────────────────────────────────────────────────────────────────

export interface MergeOptions {
  ref: string;
  noFf?: boolean;
  noCommit?: boolean;
  squash?: boolean;
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

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'branch:merge',
    reject: false,
  });

  const hasConflicts = /CONFLICT|Automatic merge failed/i.test(r.stderr) || /CONFLICT|Automatic merge failed/i.test(r.stdout);
  const fastForward = /Fast-forward/i.test(r.stdout);

  // Get conflict paths.
  let conflicts: string[] = [];
  if (hasConflicts) {
    const cr = await gitRun({
      cwd: workTree,
      args: ['diff', '--name-only', '--diff-filter=U', '-z'],
      channel: 'branch:merge',
      reject: false,
    });
    if (cr.ok) conflicts = cr.stdout.split('\0').filter((p) => p.length > 0);
  }

  return {
    success: r.ok,
    data: { conflicts, fastForward },
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: r.ok ? ['HEAD'] : [],
    requiresRefresh: true,
    state: hasConflicts ? await probeState(workTree, join(workTree, '.git')) : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rebase
// ─────────────────────────────────────────────────────────────────────────────

export interface RebaseOptions {
  onto: string;
  interactive?: boolean;
}

export async function rebaseBranch(
  workTree: string,
  opts: RebaseOptions,
): Promise<WriteResult<{ conflicts: readonly string[]; step: number | null; total: number | null }>> {
  const args = ['rebase'];
  if (opts.interactive) args.push('-i');
  args.push(opts.onto);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'branch:rebase',
    reject: false,
  });

  const hasConflicts = /CONFLICT|could not apply|Merge conflict/i.test(r.stderr) || /CONFLICT|could not apply/i.test(r.stdout);

  let conflicts: string[] = [];
  let step: number | null = null;
  let total: number | null = null;

  if (hasConflicts) {
    const cr = await gitRun({
      cwd: workTree,
      args: ['diff', '--name-only', '--diff-filter=U', '-z'],
      channel: 'branch:rebase',
      reject: false,
    });
    if (cr.ok) conflicts = cr.stdout.split('\0').filter((p) => p.length > 0);

    // Read rebase step from .git/rebase-merge/{msgnum,end}
    const { readFileSync, existsSync } = await import('node:fs');
    const gitDir = join(workTree, '.git');
    const rmDir = existsSync(join(gitDir, 'rebase-merge')) ? join(gitDir, 'rebase-merge') : join(gitDir, 'rebase-apply');
    try {
      if (existsSync(join(rmDir, 'msgnum'))) {
        step = parseInt(readFileSync(join(rmDir, 'msgnum'), 'utf8').trim(), 10);
      }
      if (existsSync(join(rmDir, 'end'))) {
        total = parseInt(readFileSync(join(rmDir, 'end'), 'utf8').trim(), 10);
      }
    } catch {
      // best-effort
    }
  }

  return {
    success: r.ok,
    data: { conflicts, step, total },
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: r.ok ? ['HEAD'] : [],
    requiresRefresh: true,
    state: hasConflicts ? await probeState(workTree, join(workTree, '.git')) : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive rebase (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

export async function rebaseInteractivePlan(
  workTree: string,
  onto: string,
): Promise<RebaseInteractivePlan> {
  const r = await gitRun({
    cwd: workTree,
    args: ['log', `--pretty=format:%H%x1f%an%x1f%s`, `${onto}..HEAD`],
    channel: 'rebase:interactive',
    reject: false,
  });

  const lines = r.stdout.trim().split('\n').filter(Boolean).reverse();
  const items: RebaseInteractivePlanItem[] = lines.map((line, i) => {
    const [sha = '', author = '', subject = ''] = line.split('\x1f');
    return { id: `todo-${i}`, action: 'pick', sha, subject, author };
  });

  const branchR = await gitRun({
    cwd: workTree,
    args: ['branch', '--show-current'],
    channel: 'rebase:interactive',
    reject: false,
  });
  const currentBranch = branchR.ok ? branchR.stdout.trim() : null;

  return { onto, currentBranch, items };
}

export async function applyRebaseInteractive(
  workTree: string,
  onto: string,
  items: { action: string; sha: string }[],
): Promise<WriteResult<RebaseResultData>> {
  const tmpDir = mkdtempSync(join(tmpdir(), 'opengit-rebase-'));
  const todoPath = join(tmpDir, 'git-rebase-todo');
  const todoContent = items.map((item) => `${item.action} ${item.sha}`).join('\n') + '\n';
  writeFileSync(todoPath, todoContent, 'utf8');

  const bridgeScript = `#!/bin/sh\ncp "${todoPath}" "$1"\n`;
  const bridgePath = join(tmpDir, 'opengit-sequence-editor.sh');
  writeFileSync(bridgePath, bridgeScript, { mode: 0o755 });

  try {
    const r = await gitRun({
      cwd: workTree,
      args: ['rebase', '-i', onto],
      channel: 'branch:rebaseInteractive',
      reject: false,
      env: {
        GIT_SEQUENCE_EDITOR: bridgePath,
        GIT_EDITOR: bridgePath,
      },
    });

    const hasConflicts = /CONFLICT|could not apply|Merge conflict/i.test(r.stderr) || /CONFLICT|could not apply/i.test(r.stdout);
    let conflicts: string[] = [];
    let step: number | null = null;
    let total: number | null = null;

    if (hasConflicts) {
      const cr = await gitRun({
        cwd: workTree,
        args: ['diff', '--name-only', '--diff-filter=U', '-z'],
        channel: 'branch:rebaseInteractive',
        reject: false,
      });
      if (cr.ok) conflicts = cr.stdout.split('\0').filter((p) => p.length > 0);
    }

    return {
      success: r.ok,
      data: { conflicts, step, total },
      stdout: r.stdout,
      stderr: r.stderr,
      changedRefs: r.ok ? ['HEAD'] : [],
      requiresRefresh: true,
      state: hasConflicts ? await probeState(workTree, join(workTree, '.git')) : undefined,
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cherry-pick + Revert
// ─────────────────────────────────────────────────────────────────────────────

export async function cherryPick(
  workTree: string,
  shas: readonly string[],
  noCommit: boolean,
): Promise<WriteResult> {
  const args = ['cherry-pick'];
  if (noCommit) args.push('--no-commit');
  args.push(...shas);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'commit:cherryPick',
    reject: false,
  });

  const hasConflicts = /CONFLICT|could not apply|Merge conflict/i.test(r.stderr) || /CONFLICT|could not apply/i.test(r.stdout);

  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: r.ok ? ['HEAD'] : [],
    requiresRefresh: true,
    state: hasConflicts ? await probeState(workTree, join(workTree, '.git')) : undefined,
  };
}

export async function revertCommits(
  workTree: string,
  shas: readonly string[],
  noCommit: boolean,
): Promise<WriteResult> {
  const args = ['revert'];
  if (noCommit) args.push('--no-commit');
  args.push(...shas);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'commit:revert',
    reject: false,
  });

  const hasConflicts = /CONFLICT|could not apply|Merge conflict/i.test(r.stderr) || /CONFLICT|could not apply/i.test(r.stdout);

  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: r.ok ? ['HEAD'] : [],
    requiresRefresh: true,
    state: hasConflicts ? await probeState(workTree, join(workTree, '.git')) : undefined,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// In-progress operation: abort / continue / skip
// ─────────────────────────────────────────────────────────────────────────────

export async function abortOperation(
  workTree: string,
  kind: OperationKind,
): Promise<WriteResult> {
  const subcommand = abortSubcommand(kind);
  const r = await gitRun({
    cwd: workTree,
    args: [subcommand.cmd, '--abort'],
    channel: 'operation:abort',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['HEAD'],
    requiresRefresh: true,
  };
}

export async function continueOperation(
  workTree: string,
  kind: OperationKind,
): Promise<WriteResult> {
  const sub = abortSubcommand(kind);
  const args = [sub.cmd, '--continue'];
  // merge --continue was added in git 2.12; for older git, fall back to commit.
  // rebase --continue, cherry-pick --continue, revert --continue all exist.

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'operation:continue',
    reject: false,
  });

  const stillInProgress = /CONFLICT|Merge conflict|could not apply/i.test(r.stderr);

  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: r.ok ? ['HEAD'] : [],
    requiresRefresh: true,
    state: stillInProgress ? await probeState(workTree, join(workTree, '.git')) : undefined,
  };
}

export async function skipOperation(
  workTree: string,
  kind: OperationKind,
): Promise<WriteResult> {
  // Skip only meaningful for rebase and cherry-pick.
  const sub = abortSubcommand(kind);
  const r = await gitRun({
    cwd: workTree,
    args: [sub.cmd, '--skip'],
    channel: 'operation:skip',
    reject: false,
  });

  const stillInProgress = /CONFLICT|Merge conflict|could not apply/i.test(r.stderr);

  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: r.ok ? ['HEAD'] : [],
    requiresRefresh: true,
    state: stillInProgress ? await probeState(workTree, join(workTree, '.git')) : undefined,
  };
}

function abortSubcommand(kind: OperationKind): { cmd: string } {
  switch (kind) {
    case 'merge': return { cmd: 'merge' };
    case 'rebase': return { cmd: 'rebase' };
    case 'cherry-pick': return { cmd: 'cherry-pick' };
    case 'revert': return { cmd: 'revert' };
    case 'bisect': return { cmd: 'bisect' };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch reset
// ─────────────────────────────────────────────────────────────────────────────

export async function resetBranch(
  workTree: string,
  ref: string,
  mode: 'soft' | 'mixed' | 'hard' | 'keep',
): Promise<WriteResult> {
  const args = ['reset'];
  if (mode !== 'mixed') args.push(`--${mode}`);
  args.push(ref);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'branch:reset',
    reject: false,
  });
  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: ['HEAD'],
    requiresRefresh: r.ok,
  };
}

// Need join for rebase step reading
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Worktree
// ─────────────────────────────────────────────────────────────────────────────

export async function listWorktrees(workTree: string): Promise<Worktree[]> {
  const r = await gitRun({
    cwd: workTree,
    args: ['worktree', 'list', '--porcelain'],
    channel: 'worktree:list',
    reject: false,
  });
  if (!r.ok || !r.stdout) return [];
  return parseWorktrees(r.stdout);
}

export interface WorktreeCreateOptions {
  path: string;
  branch?: string;      // omit → detached HEAD
  start: string;        // starting point (HEAD, branch, sha)
  lock?: string;        // lock reason
}

export async function createWorktree(
  workTree: string,
  opts: WorktreeCreateOptions,
): Promise<WriteResult> {
  const args = ['worktree', 'add'];
  if (opts.branch) {
    args.push('-b', opts.branch);
  } else {
    args.push('--detach');
  }
  if (opts.lock) {
    args.push('--lock', opts.lock);
  }
  args.push(opts.path, opts.start);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'worktree:create',
    reject: false,
  });

  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: opts.branch ? [`refs/heads/${opts.branch}`] : [],
    requiresRefresh: r.ok,
  };
}

export async function removeWorktree(
  workTree: string,
  path: string,
  force: boolean,
): Promise<WriteResult> {
  const args = ['worktree', 'remove'];
  if (force) args.push('--force');
  args.push(path);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'worktree:remove',
    reject: false,
  });

  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: [],
    requiresRefresh: r.ok,
  };
}

export async function pruneWorktrees(workTree: string): Promise<WriteResult> {
  const r = await gitRun({
    cwd: workTree,
    args: ['worktree', 'prune', '--verbose'],
    channel: 'worktree:prune',
    reject: false,
  });

  return {
    success: r.ok,
    stdout: r.stdout,
    stderr: r.stderr,
    changedRefs: [],
    requiresRefresh: r.ok,
  };
}

// electron/main/git/repo.ts — high-level read operations against a repo path.
// Each function wraps gitRun + a parser. These are what the IPC handlers call.

import { join, resolve } from 'node:path';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { gitRun, gitText } from './client';
import {
  parseStatus,
  parseLog,
  LOG_FORMAT,
  parseBranches,
  parseRemotes,
  parseInProgressState,
  withConflicts,
  parseNumstat,
  parseUnifiedDiff,
  isBinaryContent,
} from './parse';
import type { RepoInfo, RepoStatus, Commit, Branch, RemoteInfo, RefLabel, DiffFile, DiffResult } from '@shared/git';
import type { RepoSearchResult } from '@shared/ipc';

export interface OpenedRepo {
  info: RepoInfo;
  workTreeRoot: string;
  gitDir: string;
}

/** Resolve gitDir from a working-tree path (handles .git as file → worktree). */
function resolveGitDir(workTree: string): string | null {
  const dotGit = join(workTree, '.git');
  if (!existsSync(dotGit)) return null;
  const s = statSync(dotGit);
  if (s.isDirectory()) return dotGit;
  // .git is a file — worktree pointer. Parse "gitdir: <path>".
  try {
    const content = readFileSync(dotGit, 'utf8').trim();
    const m = content.match(/^gitdir:\s*(.+)$/);
    if (m) return resolve(workTree, m[1]!.trim());
  } catch {
    // fall through
  }
  return null;
}

export async function openRepo(path: string): Promise<OpenedRepo> {
  const resolved = resolve(path);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new GitNotFoundLike(`Not a directory: ${resolved}`);
  }

  // Find the worktree root by walking up until .git appears.
  let workTreeRoot = resolved;
  let gitDir = resolveGitDir(workTreeRoot);
  while (!gitDir) {
    const parent = join(workTreeRoot, '..');
    if (parent === workTreeRoot) {
      throw new GitNotFoundLike(`Not a git repository: ${resolved}`);
    }
    workTreeRoot = parent;
    gitDir = resolveGitDir(workTreeRoot);
  }

  // Head + version.
  const version = await gitText({
    cwd: workTreeRoot,
    args: ['--version'],
    channel: 'repo:open',
  });

  let headRef: string | null = null;
  let headSha: string | null = null;
  try {
    headRef = readFileSync(join(gitDir, 'HEAD'), 'utf8').trim();
  } catch {
    // ignore — unborn
  }
  if (headRef && !headRef.startsWith('ref: ')) {
    // detached — headRef is already a sha
    headSha = headRef;
    headRef = null;
  } else if (headRef) {
    // resolve ref to sha
    try {
      const sha = await gitText({
        cwd: workTreeRoot,
        args: ['rev-parse', '--verify', '--quiet', headRef.slice(5)],
        channel: 'repo:open',
      });
      headSha = sha.trim() || null;
    } catch {
      headSha = null; // unborn branch
    }
  }

  const isBare = existsSync(join(gitDir, 'HEAD')) === false && existsSync(join(gitDir, 'config'));
  const isShallow = existsSync(join(gitDir, 'shallow'));
  const isDetached = headRef === null && headSha !== null;
  const currentBranch = headRef ? headRef.slice('ref: '.length).replace(/^refs\/heads\//, '') : null;

  const info: RepoInfo = {
    path: workTreeRoot,
    gitDir,
    isBare,
    isShallow,
    isDetached,
    headSha,
    currentBranch,
    gitVersion: version.trim().replace(/^git version\s+/, ''),
  };

  return { info, workTreeRoot, gitDir };
}

class GitNotFoundLike extends Error {}

export async function getStatus(workTree: string, gitDir: string): Promise<RepoStatus> {
  const raw = await gitText({
    cwd: workTree,
    args: ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'],
    channel: 'repo:status',
  });
  const base = parseStatus(raw, gitDir, workTree);

  // Fill conflict paths if any in-progress state has conflicts pending.
  let conflicts: string[] = [];
  if (base.states.length > 0) {
    const r = await gitRun({
      cwd: workTree,
      args: ['diff', '--name-only', '--diff-filter=U', '-z'],
      channel: 'repo:state',
      reject: false,
    });
    if (r.ok) conflicts = r.stdout.split('\0').filter((p) => p.length > 0);
  }
  return { ...base, states: withConflicts(base.states, conflicts) };
}

export interface GetLogOptions {
  range?: string;
  skip: number;
  limit: number;
  paths?: string[];
  refsBySha?: ReadonlyMap<string, RefLabel[]>;
}

export async function getLog(
  workTree: string,
  opts: GetLogOptions,
): Promise<{ commits: Commit[]; hasMore: boolean }> {
  // Fetch limit + 1 so we can tell if there's more.
  const fetchN = opts.limit + 1;
  const args = ['log', `--pretty=format:${LOG_FORMAT}`, '-z', `--max-count=${fetchN}`, `--skip=${opts.skip}`];
  if (opts.range) args.push(opts.range);
  if (opts.paths && opts.paths.length > 0) {
    args.push('--', ...opts.paths);
  }
  const raw = await gitText({
    cwd: workTree,
    args,
    channel: 'repo:log',
  });
  const parsed = parseLog(raw, opts.refsBySha, opts.limit);
  // Trim to requested limit.
  return { commits: parsed.commits.slice(0, opts.limit), hasMore: parsed.hasMore };
}

export async function getBranches(
  workTree: string,
  gitDir: string,
): Promise<{ branches: Branch[]; refsBySha: Map<string, RefLabel[]>; currentHeadSha: string | null }> {
  const fmt = [
    '%(refname)',
    '%(objectname)',
    '%(upstream)',
    '%(upstream:track)',
    '%(HEAD)',
    '%(creatordate:iso-strict)',
  ].join('\x1f');
  const raw = await gitText({
    cwd: workTree,
    args: ['for-each-ref', `--format=${fmt}`, 'refs/heads/', 'refs/remotes/', 'refs/tags/'],
    channel: 'repo:branches',
  });

  let headRef: string | null = null;
  let headSha: string | null = null;
  let actualGitDir = gitDir;
  try {
    if (statSync(gitDir).isFile()) {
      // Worktree: .git is a file pointing to the real gitdir
      const content = readFileSync(gitDir, 'utf8').trim();
      const match = content.match(/^gitdir:\s*(.+)$/m);
      if (match) actualGitDir = match[1]!.trim();
    }
  } catch {
    // ignore — will fall through to the HEAD read below
  }
  try {
    headRef = readFileSync(join(actualGitDir, 'HEAD'), 'utf8').trim();
  } catch {
    // ignore
  }
  if (headRef && !headRef.startsWith('ref: ')) {
    headSha = headRef;
    headRef = null;
  }

  return parseBranches(raw, headRef, headSha);
}

export async function getRemotes(workTree: string): Promise<RemoteInfo[]> {
  const r = await gitRun({
    cwd: workTree,
    args: ['remote', '-v'],
    channel: 'repo:remotes',
    reject: false,
  });
  if (!r.ok) return [];
  return parseRemotes(r.stdout);
}

export async function searchRepository(
  workTree: string,
  gitDir: string,
  query: string,
  limit: number,
): Promise<RepoSearchResult[]> {
  const q = query.trim().toLowerCase();
  const matches = (value: string) => !q || value.toLowerCase().includes(q);
  const results: RepoSearchResult[] = [];

  const { branches } = await getBranches(workTree, gitDir);
  for (const branch of branches) {
    if (results.length >= limit) break;
    if (!matches(branch.shortName) && !matches(branch.name)) continue;
    results.push({
      kind: branch.kind === 'tag' ? 'tag' : 'branch',
      label: branch.shortName,
      detail: branch.kind,
      ref: branch.shortName,
      sha: branch.sha,
    });
  }

  if (results.length < limit) {
    const log = await getLog(workTree, { skip: 0, limit: Math.min(50, limit), refsBySha: undefined });
    for (const commit of log.commits) {
      if (results.length >= limit) break;
      if (!matches(commit.subject) && !matches(commit.sha) && !matches(commit.author.name)) continue;
      results.push({
        kind: 'commit',
        label: commit.subject,
        detail: `${commit.author.name} ${commit.sha.slice(0, 7)}`,
        sha: commit.sha,
      });
    }
  }

  if (results.length < limit) {
    const files = await gitRun({
      cwd: workTree,
      args: ['ls-files', '-z'],
      channel: 'repo:search',
      reject: false,
    });
    if (files.ok) {
      for (const path of files.stdout.split('\0').filter(Boolean)) {
        if (results.length >= limit) break;
        if (!matches(path)) continue;
        results.push({ kind: 'file', label: path, detail: 'tracked file', path });
      }
    }
  }

  return results;
}

export async function getState(workTree: string, gitDir: string): Promise<RepoStatus['states']> {
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
// Diff + file content operations (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

export interface GetDiffOptions {
  path: string;
  ref?: string;       // commit sha or ref; omit for working tree vs index
  base?: string;      // base commit for commit-vs-commit diff
  ignoreWhitespace?: boolean;
  contextLines?: number;
}

export async function getDiff(workTree: string, opts: GetDiffOptions): Promise<DiffResult> {
  const args = ['diff', '--no-color', '--find-renames', `-U${opts.contextLines ?? 3}`];
  if (opts.ignoreWhitespace) args.push('-w');
  if (opts.base && opts.ref) {
    args.push(`${opts.base}..${opts.ref}`);
  } else if (opts.ref) {
    // diff between a commit and working tree
    args.push(opts.ref);
  }
  // For working tree vs index: no ref args needed (default git diff behavior).
  args.push('--', opts.path);

  const r = await gitRun({
    cwd: workTree,
    args,
    channel: 'diff:file',
    reject: false,
  });

  if (!r.ok || r.stdout.length === 0) {
    // No diff output — either clean or binary file with no textual diff.
    return {
      path: opts.path,
      oldPath: null,
      isBinary: false,
      isRename: false,
      isCopy: false,
      additions: 0,
      deletions: 0,
      oldMode: null,
      newMode: null,
      hunks: [],
    };
  }

  return parseUnifiedDiff(r.stdout, opts.path);
}

export async function getCommitFiles(workTree: string, sha: string): Promise<DiffFile[]> {
  // Use --numstat for additions/deletions + --name-status for kind, merged into one call.
  // Format with --name-status (no -z): "A\tpath\nR100\tnewpath\toldpath\n..."
  const nameStatusRaw = await gitText({
    cwd: workTree,
    args: ['diff-tree', '--no-commit-id', '--name-status', '--root', '-M', sha],
    channel: 'commit:files',
  });

  const lines = nameStatusRaw.split('\n').filter((l) => l.length > 0);
  const files: DiffFile[] = [];

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const statusLetter = parts[0]![0]!;
    const path = parts[1]!;
    const oldPath = parts.length > 2 ? parts[2]! : null;
    const isRename = statusLetter === 'R';
    const isCopy = statusLetter === 'C';

    files.push({
      path,
      oldPath,
      isBinary: false,
      isRename,
      isCopy,
      additions: 0,
      deletions: 0,
      oldMode: null,
      newMode: null,
    });
  }

  // Fetch numstat for additions/deletions/binary detection.
  try {
    const numstatRaw = await gitText({
      cwd: workTree,
      args: ['diff-tree', '--no-commit-id', '--numstat', '--root', '-M', sha],
      channel: 'commit:files',
    });
    const numstatFiles = parseNumstat(numstatRaw);
    const numstatByPath = new Map(numstatFiles.map((f) => [f.path, f]));
    // Build final list with numstat data merged in.
    return files.map((f) => {
      const ns = numstatByPath.get(f.path);
      if (ns) {
        return {
          ...f,
          additions: ns.additions,
          deletions: ns.deletions,
          isBinary: ns.isBinary,
        };
      }
      return f;
    });
  } catch {
    return files;
  }
}

export interface GetFileContentOptions {
  path: string;
  ref?: string;      // commit sha or ref; omit for working tree
  maxBytes?: number; // truncate if larger
}

export interface FileContentResult {
  content: string;
  isBinary: boolean;
  truncated: boolean;
  sizeBytes: number;
}

export async function getFileContent(
  workTree: string,
  opts: GetFileContentOptions,
): Promise<FileContentResult> {
  const maxBytes = opts.maxBytes ?? 512_000;

  if (!opts.ref) {
    // Working tree: read from disk.
    const fsPath = join(workTree, opts.path);
    if (!existsSync(fsPath)) {
      return { content: '', isBinary: false, truncated: false, sizeBytes: 0 };
    }
    const stat = statSync(fsPath);
    const sizeBytes = stat.size;
    const truncated = sizeBytes > maxBytes;

    const buf = readFileSync(fsPath);
    const slice = truncated ? buf.subarray(0, maxBytes) : buf;
    const content = slice.toString('utf8');
    const binary = isBinaryContent(content);

    return {
      content: binary ? '' : content,
      isBinary: binary,
      truncated,
      sizeBytes,
    };
  }

  // Git object: use `git cat-file blob` or `git show ref:path`.
  const r = await gitRun({
    cwd: workTree,
    args: ['show', `${opts.ref}:${opts.path}`],
    channel: 'file:content',
    reject: false,
  });

  if (!r.ok) {
    // File doesn't exist at this ref (e.g. added in a later commit).
    return { content: '', isBinary: false, truncated: false, sizeBytes: 0 };
  }

  const content = r.stdout;
  const sizeBytes = content.length;
  const truncated = sizeBytes > maxBytes;
  const sliced = truncated ? content.slice(0, maxBytes) : content;
  const binary = isBinaryContent(sliced);

  return {
    content: binary ? '' : truncated ? sliced + '\n... (truncated)' : sliced,
    isBinary: binary,
    truncated,
    sizeBytes,
  };
}

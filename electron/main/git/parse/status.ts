// electron/main/git/parse/status.ts — parse `git status --porcelain=v2 --branch -z`.
// See docs/architecture/git-types.md for the output type.

import type {
  RepoStatus,
  StatusEntry,
  StatusCode,
  EntryKind,
} from '@shared/git';
import { parseInProgressState } from './state';

const STATUS_TO_CODE: Record<string, StatusCode> = {
  ' ': 'unmodified',
  M: 'modified',
  T: 'modified', // type change — treat as modified for UI
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'unmerged',
  '?': 'untracked',
  '!': 'ignored',
};

export function parseStatus(
  raw: string,
  gitDir: string,
  workTreeRoot: string,
): RepoStatus {
  // Split on NUL (-z). Trailing empty entry is fine.
  const records = raw.split('\0').filter((r) => r.length > 0);

  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const entries: StatusEntry[] = [];

  for (const rec of records) {
    if (rec.startsWith('# branch.head ')) {
      branch = rec.slice('# branch.head '.length);
      if (branch === '(detached)') branch = null;
      continue;
    }
    if (rec.startsWith('# branch.upstream ')) {
      upstream = rec.slice('# branch.upstream '.length);
      continue;
    }
    if (rec.startsWith('# branch.ab ')) {
      const rest = rec.slice('# branch.ab '.length);
      const m = rest.match(/\+(\d+) -(\d+)/);
      if (m) {
        ahead = Number(m[1]);
        behind = Number(m[2]);
      }
      continue;
    }
    if (rec.startsWith('# ') ) continue; // other headers we don't use

    // Ordinary changed entry: "1 XY sub mH mI mW hH hI <space>path" (path may contain spaces; -z NUL-terminates).
    // Renamed/copied: "2 XY sub mH mI mW hH hI R100<TAB>newpath<TAB>oldpath".
    // Unmerged: "u XY sub m1 m2 m3 mW h1 h2 h3 <space>path".
    // Untracked/ignored: "? <path>" / "! <path>".
    const tag = rec[0];
    if (tag === '1') {
      const parts = rec.split(' ');
      const indexCode = parts[1]![0]!;
      const worktreeCode = parts[1]![1]!;
      const modeIndex = parts[4]!;        // mI
      const modeWorktree = parts[5]!;     // mW
      const blobIndex = parts[7]!;        // hI
      const path = parts.slice(8).join(' '); // path may contain spaces
      entries.push(
        buildEntry({
          path,
          oldPath: null,
          indexCode,
          worktreeCode,
          modeIndex,
          modeWorktree,
          blobIndex,
          blobWorktree: null,
        }),
      );
    } else if (tag === '2') {
      const tabParts = rec.split('\t');
      const head = tabParts[0]!.split(' ');
      const indexCode = head[1]![0]!;
      const worktreeCode = head[1]![1]!;
      const modeIndex = head[4]!;
      const modeWorktree = head[5]!;
      const blobIndex = head[7]!;
      const path = tabParts[1]!;
      const oldPath = tabParts[2] ?? null;
      entries.push(
        buildEntry({
          path,
          oldPath,
          indexCode,
          worktreeCode,
          modeIndex,
          modeWorktree,
          blobIndex,
          blobWorktree: null,
        }),
      );
    } else if (tag === 'u') {
      const parts = rec.split(' ');
      const indexCode = parts[1]![0]!;
      const worktreeCode = parts[1]![1]!;
      const modeWorktree = parts[6]!;     // mW
      const blobWorktree = parts[9]!;     // h3 (stage 3)
      const path = parts.slice(10).join(' ');
      entries.push(
        buildEntry({
          path,
          oldPath: null,
          indexCode,
          worktreeCode,
          modeIndex: null,
          modeWorktree,
          blobIndex: null,
          blobWorktree,
        }),
      );
    } else if (tag === '?') {
      const path = rec.slice(2);
      entries.push(
        buildEntry({
          path,
          oldPath: null,
          indexCode: '?',
          worktreeCode: '?',
          modeIndex: null,
          modeWorktree: null,
          blobIndex: null,
          blobWorktree: null,
        }),
      );
    } else if (tag === '!') {
      const path = rec.slice(2);
      entries.push(
        buildEntry({
          path,
          oldPath: null,
          indexCode: '!',
          worktreeCode: '!',
          modeIndex: null,
          modeWorktree: null,
          blobIndex: null,
          blobWorktree: null,
        }),
      );
    }
  }

  const states = parseInProgressState(gitDir, workTreeRoot);
  const isClean = entries.length === 0 && states.length === 0;

  return {
    branch,
    upstream,
    ahead,
    behind,
    entries,
    isClean,
    states,
  };
}

interface BuildEntryArgs {
  path: string;
  oldPath: string | null;
  indexCode: string;
  worktreeCode: string;
  modeIndex: string | null;
  modeWorktree: string | null;
  blobIndex: string | null;
  blobWorktree: string | null;
}

function buildEntry(a: BuildEntryArgs): StatusEntry {
  const indexStatus = STATUS_TO_CODE[a.indexCode] ?? 'unmodified';
  const worktreeStatus = STATUS_TO_CODE[a.worktreeCode] ?? 'unmodified';
  const kind = deriveKind(indexStatus, worktreeStatus);
  const staged = indexStatus !== 'unmodified' && indexStatus !== 'untracked' && indexStatus !== 'ignored';
  const unstaged =
    worktreeStatus !== 'unmodified' && worktreeStatus !== 'untracked' && worktreeStatus !== 'ignored';
  return {
    path: a.path,
    oldPath: a.oldPath,
    indexStatus,
    worktreeStatus,
    modeIndex: a.modeIndex === '0' || !a.modeIndex ? null : a.modeIndex,
    modeWorktree: a.modeWorktree === '0' || !a.modeWorktree ? null : a.modeWorktree,
    blobIndex: !a.blobIndex || a.blobIndex === '0' ? null : a.blobIndex,
    blobWorktree: !a.blobWorktree || a.blobWorktree === '0' ? null : a.blobWorktree,
    kind,
    staged,
    unstaged,
  };
}

function deriveKind(index: StatusCode, worktree: StatusCode): EntryKind {
  if (index === 'untracked' || worktree === 'untracked') return 'untracked';
  if (index === 'ignored' || worktree === 'ignored') return 'ignored';
  if (index === 'unmerged' || worktree === 'unmerged') return 'unmerged';
  if (index === 'renamed' || worktree === 'renamed') return 'renamed';
  if (index === 'copied' || worktree === 'copied') return 'copied';
  if (index === 'added' || worktree === 'added') return 'added';
  if (index === 'deleted' || worktree === 'deleted') return 'deleted';
  return 'modified';
}

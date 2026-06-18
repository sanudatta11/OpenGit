// shared/git.ts — parsed domain types. Imported by main, preload, renderer.
// See docs/architecture/git-types.md for the rationale.

// ─────────────────────────────────────────────────────────────────────────────
// Repo
// ─────────────────────────────────────────────────────────────────────────────

export interface RepoInfo {
  readonly path: string;
  readonly gitDir: string;
  readonly isBare: boolean;
  readonly isShallow: boolean;
  readonly isDetached: boolean;
  readonly headSha: string | null;
  readonly currentBranch: string | null;
  readonly gitVersion: string;
}

export interface RemoteInfo {
  readonly name: string;
  readonly fetchUrl: string | null;
  readonly pushUrl: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Branches & refs
// ─────────────────────────────────────────────────────────────────────────────

export type RefKind = 'local' | 'remote' | 'tag' | 'HEAD';

export interface Branch {
  readonly kind: RefKind;
  readonly name: string;
  readonly shortName: string;
  readonly sha: string;
  readonly upstream: string | null;
  readonly upstreamTrack: TrackInfo | null;
  readonly isHead: boolean;
  readonly date: string;
}

export interface TrackInfo {
  readonly ahead: number;
  readonly behind: number;
  readonly gone: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Commits / log
// ─────────────────────────────────────────────────────────────────────────────

export interface Commit {
  readonly sha: string;
  readonly parents: readonly string[];
  readonly author: Person;
  readonly committer: Person;
  readonly subject: string;
  readonly body: string;
  readonly refs: readonly RefLabel[];
  // Filled by the graph renderer, not the parser:
  lane: number;
  parentLanes: number[];
}

export interface Person {
  readonly name: string;
  readonly email: string;
  readonly date: string;
}

export interface RefLabel {
  readonly kind: RefKind;
  readonly shortName: string;
  readonly isHead: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────────────────────

export type StatusCode =
  | 'unmodified'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'unmerged'
  | 'untracked'
  | 'ignored';

export type EntryKind =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'unmerged'
  | 'untracked'
  | 'ignored';

export interface StatusEntry {
  readonly path: string;
  readonly oldPath: string | null;
  readonly indexStatus: StatusCode;
  readonly worktreeStatus: StatusCode;
  readonly modeIndex: string | null;
  readonly modeWorktree: string | null;
  readonly blobIndex: string | null;
  readonly blobWorktree: string | null;
  readonly kind: EntryKind;
  readonly staged: boolean;
  readonly unstaged: boolean;
}

export interface RepoStatus {
  readonly branch: string | null;
  readonly upstream: string | null;
  readonly ahead: number;
  readonly behind: number;
  readonly entries: readonly StatusEntry[];
  readonly isClean: boolean;
  readonly states: readonly InProgressState[];
}

// ─────────────────────────────────────────────────────────────────────────────
// In-progress operations
// ─────────────────────────────────────────────────────────────────────────────

export type OperationKind = 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'bisect';

export interface InProgressState {
  readonly kind: OperationKind;
  readonly onto: string | null;
  readonly currentStep: number | null;
  readonly totalSteps: number | null;
  readonly conflictingPaths: readonly string[];
  readonly canAbort: boolean;
  readonly canContinue: boolean;
  readonly canSkip: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffFile {
  readonly path: string;
  readonly oldPath: string | null;
  readonly isBinary: boolean;
  readonly isRename: boolean;
  readonly isCopy: boolean;
  readonly additions: number;
  readonly deletions: number;
  readonly oldMode: string | null;
  readonly newMode: string | null;
}

export interface DiffResult extends DiffFile {
  readonly hunks: readonly Hunk[];
}

export interface Hunk {
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly header: string;
  readonly lines: readonly DiffLine[];
}

export type DiffLineType = 'context' | 'add' | 'del' | 'hunk-header' | 'file-header' | 'no-newline';

export interface DiffLine {
  readonly type: DiffLineType;
  readonly oldLineNo: number | null;
  readonly newLineNo: number | null;
  readonly text: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Stash
// ─────────────────────────────────────────────────────────────────────────────

export interface StashEntry {
  readonly ref: string;
  readonly sha: string;
  readonly subject: string;
  readonly date: string;
  readonly branch: string | null;
  readonly indexSha: string | null;
  readonly untrackedSha: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Worktree
// ─────────────────────────────────────────────────────────────────────────────

export interface Worktree {
  readonly path: string;
  readonly head: string | null;
  readonly branch: string | null;
  readonly detached: boolean;
  readonly bare: boolean;
  readonly locked: string | null;
  readonly prunable: boolean;
  readonly isMain: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Operation log
// ─────────────────────────────────────────────────────────────────────────────

export interface LogEntry {
  readonly id: string;
  readonly ts: number;
  readonly channel: string;
  readonly argv: readonly string[];
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly ok: boolean;
}

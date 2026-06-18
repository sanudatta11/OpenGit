// shared/ipc.ts — IPC channel map, Zod input schemas, WriteResult envelope,
// GitError model. THE CONTRACT imported by main, preload, renderer.
// See docs/architecture/ipc-contract.md for the rationale.

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Channel map — one ipcRenderer.invoke per operation, namespaced domain:action
// ─────────────────────────────────────────────────────────────────────────────

export const IPC = {
  REPO_OPEN: 'repo:open',
  REPO_CLOSE: 'repo:close',
  REPO_STATUS: 'repo:status',
  REPO_LOG: 'repo:log',
  REPO_BRANCHES: 'repo:branches',
  REPO_REMOTES: 'repo:remotes',
  REPO_STATE: 'repo:state',
  REPO_HEAD: 'repo:head',

  WORKING_TREE_STAGE: 'workingTree:stage',
  WORKING_TREE_UNSTAGE: 'workingTree:unstage',
  WORKING_TREE_DISCARD: 'workingTree:discard',
  WORKING_TREE_STAGE_HUNKS: 'workingTree:stageHunks',
  WORKING_TREE_UNSTAGE_HUNKS: 'workingTree:unstageHunks',

  COMMIT_CREATE: 'commit:create',
  COMMIT_AMEND: 'commit:amend',
  COMMIT_CHERRY_PICK: 'commit:cherryPick',
  COMMIT_REVERT: 'commit:revert',

  BRANCH_CHECKOUT: 'branch:checkout',
  BRANCH_CREATE: 'branch:create',
  BRANCH_DELETE: 'branch:delete',
  BRANCH_RENAME: 'branch:rename',
  BRANCH_MERGE: 'branch:merge',
  BRANCH_REBASE: 'branch:rebase',
  BRANCH_SET_UPSTREAM: 'branch:setUpstream',
  BRANCH_RESET: 'branch:reset',

  STASH_LIST: 'stash:list',
  STASH_CREATE: 'stash:create',
  STASH_APPLY: 'stash:apply',
  STASH_POP: 'stash:pop',
  STASH_DROP: 'stash:drop',

  REMOTE_FETCH: 'remote:fetch',
  REMOTE_PULL: 'remote:pull',
  REMOTE_PUSH: 'remote:push',

  WORKTREE_LIST: 'worktree:list',
  WORKTREE_CREATE: 'worktree:create',
  WORKTREE_REMOVE: 'worktree:remove',
  WORKTREE_PRUNE: 'worktree:prune',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RECENT_REPOS: 'settings:recentRepos',
  SETTINGS_ADD_RECENT: 'settings:addRecent',
  SETTINGS_REMOVE_RECENT: 'settings:removeRecent',

  OPERATION_ABORT: 'operation:abort',
  OPERATION_CONTINUE: 'operation:continue',
  OPERATION_SKIP: 'operation:skip',

  DIFF_FILE: 'diff:file',
  DIFF_COMMITS: 'diff:commits',
  COMMIT_FILES: 'commit:files',
  FILE_CONTENT: 'file:content',

  LOG_SUBSCRIBE: 'log:subscribe',
  LOG_EVENT: 'log:event',
  LOG_UNSUBSCRIBE: 'log:unsubscribe',

  WATCH_EVENT: 'watch:event',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

// ─────────────────────────────────────────────────────────────────────────────
// Input schemas (Zod)
// ─────────────────────────────────────────────────────────────────────────────

export const RepoOpenInput = z.object({
  path: z.string().min(1),
});
export type RepoOpenInput = z.infer<typeof RepoOpenInput>;

export const RepoLogInput = z.object({
  range: z.string().optional(),
  skip: z.number().int().nonnegative().default(0),
  limit: z.number().int().positive().max(2000).default(100),
  paths: z.array(z.string()).optional(),
});
export type RepoLogInput = z.infer<typeof RepoLogInput>;

export const PathListInput = z.object({
  paths: z.array(z.string()).min(1),
});
export type PathListInput = z.infer<typeof PathListInput>;

export const CommitCreateInput = z.object({
  message: z.string().min(1),
  amend: z.boolean().default(false),
  signoff: z.boolean().default(false),
  noVerify: z.boolean().default(false),
  author: z.object({ name: z.string(), email: z.string() }).optional(),
});
export type CommitCreateInput = z.infer<typeof CommitCreateInput>;

export const BranchCheckoutInput = z.object({
  ref: z.string(),
  create: z.boolean().default(false),
  force: z.boolean().default(false),
});
export type BranchCheckoutInput = z.infer<typeof BranchCheckoutInput>;

export const BranchCreateInput = z.object({
  name: z.string().regex(/^[^\s~^:?*\[]+$/),
  start: z.string().default('HEAD'),
  checkout: z.boolean().default(true),
});
export type BranchCreateInput = z.infer<typeof BranchCreateInput>;

export const BranchDeleteInput = z.object({
  name: z.string(),
  force: z.boolean().default(false),
});
export type BranchDeleteInput = z.infer<typeof BranchDeleteInput>;

export const BranchMergeInput = z.object({
  ref: z.string(),
  noFf: z.boolean().default(false),
  noCommit: z.boolean().default(false),
  squash: z.boolean().default(false),
});
export type BranchMergeInput = z.infer<typeof BranchMergeInput>;

export const BranchRebaseInput = z.object({
  onto: z.string(),
  interactive: z.boolean().default(false),
});
export type BranchRebaseInput = z.infer<typeof BranchRebaseInput>;

export const BranchResetInput = z.object({
  ref: z.string(),
  mode: z.enum(['soft', 'mixed', 'hard', 'keep']),
});
export type BranchResetInput = z.infer<typeof BranchResetInput>;

export const StashCreateInput = z.object({
  message: z.string().optional(),
  includeUntracked: z.boolean().default(false),
  keepIndex: z.boolean().default(false),
});
export type StashCreateInput = z.infer<typeof StashCreateInput>;

export const StashApplyInput = z.object({
  ref: z.string().default('stash@{0}'),
  keepIndex: z.boolean().default(false),
});
export type StashApplyInput = z.infer<typeof StashApplyInput>;

export const StashRefInput = z.object({
  ref: z.string().default('stash@{0}'),
});
export type StashRefInput = z.infer<typeof StashRefInput>;

export const RemoteFetchInput = z.object({
  remote: z.string().default('origin'),
  prune: z.boolean().default(true),
});
export type RemoteFetchInput = z.infer<typeof RemoteFetchInput>;

export const RemotePullInput = z.object({
  remote: z.string().default('origin'),
  branch: z.string().optional(),
  ffOnly: z.boolean().default(false),
});
export type RemotePullInput = z.infer<typeof RemotePullInput>;

export const RemotePushInput = z.object({
  remote: z.string().default('origin'),
  branch: z.string().optional(),
  forceWithLease: z.boolean().default(false),
  setUpstream: z.boolean().default(false),
});
export type RemotePushInput = z.infer<typeof RemotePushInput>;

export const WorktreeCreateInput = z.object({
  path: z.string(),
  branch: z.string().optional(),
  start: z.string().default('HEAD'),
  lock: z.string().optional(),
});
export type WorktreeCreateInput = z.infer<typeof WorktreeCreateInput>;

export const WorktreeRemoveInput = z.object({
  path: z.string(),
  force: z.boolean().default(false),
});
export type WorktreeRemoveInput = z.infer<typeof WorktreeRemoveInput>;

export const SettingsSetInput = z.object({
  gitBinPath: z.string().nullable().optional(),
  defaultDiffView: z.enum(['side-by-side', 'unified']).optional(),
  showUntracked: z.boolean().optional(),
  contextLines: z.number().int().nonnegative().max(20).optional(),
});
export type SettingsSetInput = z.infer<typeof SettingsSetInput>;

export interface SettingsData {
  gitBinPath: string | null;
  recentRepos: string[];
  defaultDiffView: 'side-by-side' | 'unified';
  showUntracked: boolean;
  contextLines: number;
}

export const DiffFileInput = z.object({
  path: z.string(),
  ref: z.string().optional(),
  base: z.string().optional(),
  ignoreWhitespace: z.boolean().default(false),
  contextLines: z.number().int().nonnegative().default(3),
});
export type DiffFileInput = z.infer<typeof DiffFileInput>;

export const CommitFilesInput = z.object({
  sha: z.string().regex(/^[0-9a-f]{4,40}$/),
});
export type CommitFilesInput = z.infer<typeof CommitFilesInput>;

export const FileContentInput = z.object({
  path: z.string(),
  ref: z.string().optional(),  // commit sha or ref; omit for working tree
  maxBytes: z.number().int().positive().max(2_000_000).default(512_000),
});
export type FileContentInput = z.infer<typeof FileContentInput>;

export const CherryPickInput = z.object({
  shas: z.array(z.string().regex(/^[0-9a-f]{4,40}$/)).min(1),
  noCommit: z.boolean().default(false),
});
export type CherryPickInput = z.infer<typeof CherryPickInput>;

export const OperationInput = z.object({
  kind: z.enum(['merge', 'rebase', 'cherry-pick', 'revert', 'bisect']),
});
export type OperationInput = z.infer<typeof OperationInput>;

// ─────────────────────────────────────────────────────────────────────────────
// Output envelope (writes)
// ─────────────────────────────────────────────────────────────────────────────

export interface WriteResult<T = unknown> {
  readonly success: boolean;
  readonly data?: T;
  readonly stdout: string;
  readonly stderr: string;
  readonly changedRefs: readonly string[];
  readonly requiresRefresh: boolean;
  readonly state?: readonly import('./git').InProgressState[];
}

export interface CommitResultData {
  readonly sha: string;
}

export interface MergeResultData {
  readonly conflicts: readonly string[];
  readonly fastForward: boolean;
}

export interface RebaseResultData {
  readonly conflicts: readonly string[];
  readonly step: number | null;
  readonly total: number | null;
}

export interface FetchResultData {
  readonly fetched: number;
  readonly pruned: readonly string[];
}

export interface PushResultData {
  readonly pushed: number;
  readonly rejected: boolean;
  readonly remoteHead: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error model
// ─────────────────────────────────────────────────────────────────────────────

export type GitErrorCode =
  | 'GitNotFound'
  | 'NotARepo'
  | 'BadInput'
  | 'Conflicts'
  | 'UncommittedChanges'
  | 'Rejected'
  | 'GitFailed'
  | 'Cancelled'
  | 'NotSupported';

export interface GitErrorShape {
  readonly code: GitErrorCode;
  readonly message: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly friendly: string;
  readonly command?: string;
  readonly exitCode?: number;
}

// Rehydrated in renderer/preload — Electron strips Error subclass identity.
export class GitError extends Error implements GitErrorShape {
  readonly code: GitErrorCode;
  readonly stdout: string;
  readonly stderr: string;
  readonly friendly: string;
  readonly command?: string;
  readonly exitCode?: number;

  constructor(shape: GitErrorShape) {
    super(shape.message);
    this.name = 'GitError';
    this.code = shape.code;
    this.stdout = shape.stdout;
    this.stderr = shape.stderr;
    this.friendly = shape.friendly;
    this.command = shape.command;
    this.exitCode = shape.exitCode;
  }

  static is(x: unknown): x is GitError {
    return x instanceof GitError || (typeof x === 'object' && x !== null && (x as GitError).name === 'GitError');
  }

  static fromSerialized(x: unknown): GitError {
    if (x instanceof GitError) return x;
    if (x && typeof x === 'object' && (x as { name?: string }).name === 'GitError') {
      return new GitError(x as GitErrorShape);
    }
    return new GitError({
      code: 'GitFailed',
      message: (x as Error)?.message ?? String(x),
      stdout: '',
      stderr: '',
      friendly: 'Unexpected error',
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Watch event — pushed from main to renderer when .git changes
// ─────────────────────────────────────────────────────────────────────────────

export type WatchEventKind =
  | 'head'
  | 'index'
  | 'refs'
  | 'merge'
  | 'rebase'
  | 'cherry-pick'
  | 'revert'
  | 'bisect';

export interface WatchEvent {
  readonly kind: WatchEventKind;
  readonly ts: number;
}

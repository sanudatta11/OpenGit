// shared/ipc.ts — IPC channel map, Zod input schemas, WriteResult envelope,
// GitError model. THE CONTRACT imported by main, preload, renderer.
// See docs/architecture/ipc-contract.md for the rationale.

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Channel map — one ipcRenderer.invoke per operation, namespaced domain:action
// ─────────────────────────────────────────────────────────────────────────────

export const IPC = {
  REPO_CREATE: 'repo:create',
  REPO_CLONE: 'repo:clone',
  REPO_OPEN: 'repo:open',
  REPO_CLOSE: 'repo:close',
  REPO_REMOVE_FROM_APP: 'repo:removeFromApp',
  REPO_SEARCH: 'repo:search',
  REPO_STATUS: 'repo:status',
  REPO_LOG: 'repo:log',
  REPO_BRANCHES: 'repo:branches',
  REPO_REMOTES: 'repo:remotes',
  REPO_STATE: 'repo:state',
  REPO_HEAD: 'repo:head',
  REPO_SET_ACTIVE: 'repo:setActive',
  REPO_LIST: 'repo:list',

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
  STASH_DIFF: 'stash:diff',

  COMMIT_VERIFY: 'commit:verify',

  REMOTE_FETCH: 'remote:fetch',
  REMOTE_PULL: 'remote:pull',
  REMOTE_PUSH: 'remote:push',
  REMOTE_ADD: 'remote:add',
  REMOTE_REMOVE: 'remote:remove',
  REMOTE_SET_URL: 'remote:setUrl',
  REMOTE_FETCH_ALL: 'remote:fetchAll',

  WORKTREE_LIST: 'worktree:list',
  WORKTREE_CREATE: 'worktree:create',
  WORKTREE_REMOVE: 'worktree:remove',
  WORKTREE_PRUNE: 'worktree:prune',
  WORKTREE_LOCK: 'worktree:lock',
  WORKTREE_UNLOCK: 'worktree:unlock',
  WORKTREE_REMOVE_AND_DELETE_BRANCH: 'worktree:removeAndDeleteBranch',

  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_RECENT_REPOS: 'settings:recentRepos',
  SETTINGS_ADD_RECENT: 'settings:addRecent',
  SETTINGS_REMOVE_RECENT: 'settings:removeRecent',

  OPERATION_ABORT: 'operation:abort',
  OPERATION_CONTINUE: 'operation:continue',
  OPERATION_SKIP: 'operation:skip',
  OPERATION_UNDO: 'operation:undo',
  OPERATION_MERGE_PREVIEW: 'operation:mergePreview',
  OPERATION_PULL_PREVIEW: 'operation:pullPreview',
  OPERATION_PUSH_PREVIEW: 'operation:pushPreview',
  OPERATION_REBASE_PLAN: 'operation:rebasePlan',

  CONFLICT_FILE: 'conflict:file',
  CONFLICT_RESOLVE: 'conflict:resolve',
  CONFLICT_VERSIONS: 'conflict:versions',

  BRANCH_COMPARE: 'branch:compare',

  BRANCH_REBASE_INTERACTIVE: 'branch:rebaseInteractive',
  REBASE_INTERACTIVE_APPLY: 'rebase:interactiveApply',

  AUTH_STATUS: 'auth:status',
  AUTH_TEST_REMOTE: 'auth:testRemote',

  DIFF_FILE: 'diff:file',
  DIFF_COMMITS: 'diff:commits',
  DIFF_BLAME: 'diff:blame',
  COMMIT_FILES: 'commit:files',
  FILE_CONTENT: 'file:content',

  LOG_SUBSCRIBE: 'log:subscribe',
  LOG_EVENT: 'log:event',
  LOG_UNSUBSCRIBE: 'log:unsubscribe',

  WATCH_EVENT: 'watch:event',

  TERMINAL_RUN: 'terminal:run',
  TERMINAL_KILL: 'terminal:kill',

  SHELL_OPEN_PATH: 'shell:openPath',

  SUBMODULE_LIST: 'submodule:list',
  SUBMODULE_INIT: 'submodule:init',
  SUBMODULE_DEINIT: 'submodule:deinit',

  LFS_LIST: 'lfs:list',
  LFS_TRACK: 'lfs:track',
  LFS_UNTRACK: 'lfs:untrack',

  UPDATER_EVENT: 'updater:event',
  UPDATER_CHECK: 'updater:check',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];

// ─────────────────────────────────────────────────────────────────────────────
// Input schemas (Zod)
// ─────────────────────────────────────────────────────────────────────────────

export const RepoOpenInput = z.object({
  path: z.string().min(1),
});
export type RepoOpenInput = z.infer<typeof RepoOpenInput>;

export const RepoCreateInput = z.object({
  path: z.string().min(1),
  repoName: z.string().min(1).optional(),
  defaultBranch: z.string().min(1).default('main'),
  bare: z.boolean().default(false),
  readme: z.boolean().default(false),
  gitignore: z.string().optional(),
  license: z.enum(['MIT', 'Apache-2.0', 'GPL-3.0']).optional(),
});
export type RepoCreateInput = z.infer<typeof RepoCreateInput>;

export const RepoCloneInput = z.object({
  url: z.string().min(1),
  destinationParent: z.string().min(1),
  repoName: z.string().min(1).optional(),
  recursiveSubmodules: z.boolean().default(false),
  shallowDepth: z.number().int().positive().max(100000).optional(),
});
export type RepoCloneInput = z.infer<typeof RepoCloneInput>;

export const RepoSearchInput = z.object({
  query: z.string().default(''),
  limit: z.number().int().positive().max(200).default(50),
});
export type RepoSearchInput = z.infer<typeof RepoSearchInput>;

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
  strategy: z.enum(['merge', 'rebase', 'ff-only']).optional(),
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

export const WorktreeRemoveAndDeleteInput = z.object({
  path: z.string().min(1),
  branch: z.string().min(1),
  force: z.boolean().default(false),
});
export type WorktreeRemoveAndDeleteInput = z.infer<typeof WorktreeRemoveAndDeleteInput>;

export const WorktreeLockInput = z.object({
  path: z.string().min(1),
  reason: z.string().optional(),
});
export type WorktreeLockInput = z.infer<typeof WorktreeLockInput>;

export const WorktreeUnlockInput = z.object({
  path: z.string().min(1),
});
export type WorktreeUnlockInput = z.infer<typeof WorktreeUnlockInput>;

export const FetchAllInput = z.object({
  prune: z.boolean().default(false),
});
export type FetchAllInput = z.infer<typeof FetchAllInput>;

export const ShellOpenPathInput = z.object({
  path: z.string().min(1),
});
export type ShellOpenPathInput = z.infer<typeof ShellOpenPathInput>;

export const SettingsSetInput = z.object({
  gitBinPath: z.string().nullable().optional(),
  defaultDiffView: z.enum(['side-by-side', 'unified']).optional(),
  showUntracked: z.boolean().optional(),
  contextLines: z.number().int().nonnegative().max(20).optional(),
  theme: z.enum(['system', 'dark', 'light']).optional(),
  fontSize: z.number().int().min(10).max(22).optional(),
  defaultBranch: z.string().min(1).optional(),
  pullStrategy: z.enum(['merge', 'rebase', 'ff-only']).optional(),
  commitSubjectLength: z.number().int().min(40).max(120).optional(),
  conventionalCommitValidation: z.boolean().optional(),
  signingMode: z.enum(['none', 'gpg', 'ssh']).optional(),
  defaultExternalEditor: z.string().nullable().optional(),
  sidebarWidth: z.number().int().min(200).max(480).optional(),
  inspectorWidth: z.number().int().min(280).max(600).optional(),
  autoFetchInterval: z.number().int().nonnegative().max(3600).optional(),
  betaUpdates: z.boolean().optional(),
});
export type SettingsSetInput = z.infer<typeof SettingsSetInput>;

export interface SettingsData {
  gitBinPath: string | null;
  recentRepos: string[];
  defaultDiffView: 'side-by-side' | 'unified';
  showUntracked: boolean;
  contextLines: number;
  theme: 'system' | 'dark' | 'light';
  fontSize: number;
  defaultBranch: string;
  pullStrategy: 'merge' | 'rebase' | 'ff-only';
  commitSubjectLength: number;
  conventionalCommitValidation: boolean;
  signingMode: 'none' | 'gpg' | 'ssh';
  defaultExternalEditor: string | null;
  sidebarWidth: number;
  inspectorWidth: number;
  autoFetchInterval: number;
  betaUpdates: boolean;
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

export const UndoInput = z.object({
  kind: z.enum(['commit', 'merge', 'rebase', 'cherry-pick', 'revert', 'branch-create', 'branch-delete', 'stash-apply', 'stash-pop']),
  branch: z.string().optional(),
  sha: z.string().optional(),
});
export type UndoInput = z.infer<typeof UndoInput>;

export const MergePreviewInput = z.object({
  ref: z.string().min(1),
});
export type MergePreviewInput = z.infer<typeof MergePreviewInput>;

export const PullPreviewInput = z.object({
  remote: z.string().default('origin'),
  branch: z.string().optional(),
});
export type PullPreviewInput = z.infer<typeof PullPreviewInput>;

export const PushPreviewInput = z.object({
  remote: z.string().default('origin'),
  branch: z.string().optional(),
});
export type PushPreviewInput = z.infer<typeof PushPreviewInput>;

export const RebasePlanInput = z.object({
  onto: z.string().min(1),
});
export type RebasePlanInput = z.infer<typeof RebasePlanInput>;

export const BranchCompareInput = z.object({
  branchA: z.string().min(1),
  branchB: z.string().min(1),
});
export type BranchCompareInput = z.infer<typeof BranchCompareInput>;

export const ConflictVersionsInput = z.object({
  path: z.string().min(1),
});
export type ConflictVersionsInput = z.infer<typeof ConflictVersionsInput>;

export const BranchRenameInput = z.object({
  oldName: z.string().min(1),
  newName: z.string().regex(/^[^\s~^:?*\[]+$/),
});
export type BranchRenameInput = z.infer<typeof BranchRenameInput>;

export const BranchSetUpstreamInput = z.object({
  branch: z.string().min(1),
  upstream: z.string().min(1),
});
export type BranchSetUpstreamInput = z.infer<typeof BranchSetUpstreamInput>;

export const RevertInput = z.object({
  shas: z.array(z.string().regex(/^[0-9a-f]{4,40}$/)).min(1),
  noCommit: z.boolean().default(false),
});
export type RevertInput = z.infer<typeof RevertInput>;

export const HunkStageInput = z.object({
  path: z.string().min(1),
  patch: z.string().min(1),
});
export type HunkStageInput = z.infer<typeof HunkStageInput>;

export const RebaseInteractivePlanInput = z.object({
  onto: z.string().min(1),
});
export type RebaseInteractivePlanInput = z.infer<typeof RebaseInteractivePlanInput>;

export const RebaseInteractiveApplyInput = z.object({
  onto: z.string().min(1),
  items: z.array(z.object({
    action: z.enum(['pick', 'reword', 'edit', 'squash', 'fixup', 'exec', 'drop']),
    sha: z.string().regex(/^[0-9a-f]{4,40}$/),
  })).min(1),
});
export type RebaseInteractiveApplyInput = z.infer<typeof RebaseInteractiveApplyInput>;

export const ConflictFileInput = z.object({
  path: z.string().min(1),
});
export type ConflictFileInput = z.infer<typeof ConflictFileInput>;

export const ConflictResolveInput = z.object({
  path: z.string().min(1),
  content: z.string(),
});
export type ConflictResolveInput = z.infer<typeof ConflictResolveInput>;

export const DiffCommitsInput = z.object({
  base: z.string().min(1),
  ref: z.string().min(1),
  paths: z.array(z.string()).optional(),
});
export type DiffCommitsInput = z.infer<typeof DiffCommitsInput>;

export const BlameInput = z.object({
  path: z.string().min(1),
  ref: z.string().optional(),
});
export type BlameInput = z.infer<typeof BlameInput>;

export const VerifyCommitInput = z.object({
  sha: z.string().regex(/^[0-9a-f]{4,40}$/),
});
export type VerifyCommitInput = z.infer<typeof VerifyCommitInput>;

export const StashDiffInput = z.object({
  ref: z.string().min(1),
});
export type StashDiffInput = z.infer<typeof StashDiffInput>;

export interface BlameEntry {
  readonly sha: string;
  readonly author: string;
  readonly authorEmail: string;
  readonly authorDate: string;
  readonly line: number;
  readonly content: string;
}

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

export type RepoSearchResultKind = 'repository' | 'branch' | 'commit' | 'file' | 'tag' | 'stash';

export interface RepoSearchResult {
  readonly kind: RepoSearchResultKind;
  readonly label: string;
  readonly detail: string;
  readonly ref?: string;
  readonly path?: string;
  readonly sha?: string;
}

export interface OperationPreviewCommit {
  readonly sha: string;
  readonly subject: string;
  readonly author: string;
}

export interface OperationPreviewFile {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface MergePreview {
  readonly source: string;
  readonly target: string | null;
  readonly fastForward: boolean;
  readonly commits: readonly OperationPreviewCommit[];
  readonly files: readonly OperationPreviewFile[];
}

export interface PullPreview {
  readonly remote: string;
  readonly branch: string;
  readonly upstream: string;
  readonly incoming: readonly OperationPreviewCommit[];
  readonly local: readonly OperationPreviewCommit[];
  readonly recommendedStrategy: 'merge' | 'rebase' | 'ff-only';
}

export interface PushPreview {
  readonly remote: string;
  readonly branch: string;
  readonly upstream: string;
  readonly outgoing: readonly OperationPreviewCommit[];
  readonly behind: number;
}

export interface RebasePlan {
  readonly onto: string;
  readonly currentBranch: string | null;
  readonly commits: readonly OperationPreviewCommit[];
  readonly files: readonly OperationPreviewFile[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Branch Compare types (Phase 1)
// ─────────────────────────────────────────────────────────────────────────────

export interface BranchCompareFile {
  readonly path: string;
  readonly status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied';
  readonly additions: number;
  readonly deletions: number;
  readonly oldPath: string | null;
}

export interface BranchCompareResult {
  readonly aheadCount: number;
  readonly behindCount: number;
  readonly aheadCommits: readonly OperationPreviewCommit[];
  readonly behindCommits: readonly OperationPreviewCommit[];
  readonly files: readonly BranchCompareFile[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict versions (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

export interface ConflictVersionsResult {
  readonly ours: string;
  readonly theirs: string;
  readonly merged: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive rebase types (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

export type RebaseInteractiveAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'exec' | 'drop';

export interface RebaseInteractivePlanItem {
  readonly id: string;
  readonly action: RebaseInteractiveAction;
  readonly sha: string;
  readonly subject: string;
  readonly author: string;
}

export interface RebaseInteractivePlan {
  readonly onto: string;
  readonly currentBranch: string | null;
  readonly items: readonly RebaseInteractivePlanItem[];
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

// ─────────────────────────────────────────────────────────────────────────────
// Submodule + LFS input schemas
// ─────────────────────────────────────────────────────────────────────────────

export const SubmoduleInitInput = z.object({
  recursive: z.boolean().default(true),
});
export type SubmoduleInitInput = z.infer<typeof SubmoduleInitInput>;

export const SubmoduleDeinitInput = z.object({
  path: z.string().min(1),
  force: z.boolean().default(false),
});
export type SubmoduleDeinitInput = z.infer<typeof SubmoduleDeinitInput>;

export const LfsTrackInput = z.object({
  pattern: z.string().min(1),
});
export type LfsTrackInput = z.infer<typeof LfsTrackInput>;

export const LfsUntrackInput = z.object({
  pattern: z.string().min(1),
});
export type LfsUntrackInput = z.infer<typeof LfsUntrackInput>;

// ─────────────────────────────────────────────────────────────────────────────
// Auto-updater (electron-updater) — version metadata + event union
// ─────────────────────────────────────────────────────────────────────────────

export interface UpdaterInfo {
  readonly version: string;
  readonly releaseName?: string | null;
  readonly releaseNotes?: string | ReadonlyArray<ReleaseNoteInfo> | null;
  readonly releaseDate: string;
}

export interface ReleaseNoteInfo {
  readonly version?: string;
  readonly note?: string | null;
}

export type UpdaterEventType =
  | 'available'
  | 'downloaded'
  | 'not-available'
  | 'error';

export type UpdaterEvent =
  | { readonly type: 'available'; readonly info: UpdaterInfo }
  | { readonly type: 'downloaded'; readonly info: UpdaterInfo; readonly version: string }
  | { readonly type: 'not-available'; readonly info: UpdaterInfo }
  | { readonly type: 'error'; readonly message: string };

export type UpdaterCheckStatus = 'up-to-date' | 'available' | 'error';
export interface UpdaterCheckResult {
  readonly status: UpdaterCheckStatus;
  readonly version?: string;
  readonly message?: string;
}

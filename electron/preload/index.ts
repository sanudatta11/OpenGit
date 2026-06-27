// electron/preload/index.ts — contextBridge exposure. Mirrors shared/ipc.ts.
// Sandbox-safe: only ipcRenderer.invoke/on, no Node APIs exposed.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, GitError } from '@shared/ipc';
import type { WatchEvent, UpdaterEvent, UpdaterCheckResult } from '@shared/ipc';
import type {
  RepoInfo,
  RepoStatus,
  Commit,
  Branch,
  RemoteInfo,
  InProgressState,
  LogEntry,
  DiffResult,
  DiffFile,
  StashEntry,
  Worktree,
} from '@shared/git';
import type {
  RepoOpenInput,
  RepoCloseInput,
  RepoCreateInput,
  RepoCloneInput,
  RepoSearchInput,
  RepoLogInput,
  DiffFileInput,
  CommitFilesInput,
  FileContentInput,
  CommitCreateInput,
  BranchCheckoutInput,
  BranchCreateInput,
  BranchDeleteInput,
  RemoteFetchInput,
  RemotePullInput,
  RemotePushInput,
  WriteResult,
  CommitResultData,
  FetchResultData,
  PushResultData,
  BranchMergeInput,
  BranchRebaseInput,
  CherryPickInput,
  OperationInput,
  StashCreateInput,
  StashApplyInput,
  StashRefInput,
  StashDiffInput,
  VerifyCommitInput,
  MergeResultData,
  RebaseResultData,
  WorktreeCreateInput,
  WorktreeRemoveInput,
  SettingsSetInput,
  SettingsData,
  RepoSearchResult,
  MergePreview,
  PullPreview,
  PushPreview,
  RebasePlan,
  BranchCompareInput,
  BranchCompareResult,
} from '@shared/ipc';

export interface FileContentResult {
  content: string;
  isBinary: boolean;
  truncated: boolean;
  sizeBytes: number;
}

const api = {
  repo: {
    create: (input: RepoCreateInput): Promise<WriteResult<{ path: string }>> =>
      ipcRenderer.invoke(IPC.REPO_CREATE, input),
    clone: (input: RepoCloneInput): Promise<WriteResult<{ path: string }>> =>
      ipcRenderer.invoke(IPC.REPO_CLONE, input),
    open: (path: string): Promise<RepoInfo> =>
      ipcRenderer.invoke(IPC.REPO_OPEN, { path } satisfies RepoOpenInput),
    close: (path: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.REPO_CLOSE, { path } satisfies RepoCloseInput),
    removeFromApp: (path: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.REPO_REMOVE_FROM_APP, path),
    search: (input: RepoSearchInput): Promise<RepoSearchResult[]> =>
      ipcRenderer.invoke(IPC.REPO_SEARCH, input),
    status: (): Promise<RepoStatus> =>
      ipcRenderer.invoke(IPC.REPO_STATUS),
    log: (input: RepoLogInput): Promise<{ commits: Commit[]; hasMore: boolean }> =>
      ipcRenderer.invoke(IPC.REPO_LOG, input),
    branches: (): Promise<Branch[]> =>
      ipcRenderer.invoke(IPC.REPO_BRANCHES),
    remotes: (): Promise<RemoteInfo[]> =>
      ipcRenderer.invoke(IPC.REPO_REMOTES),
    state: (): Promise<InProgressState[]> =>
      ipcRenderer.invoke(IPC.REPO_STATE),
    head: (): Promise<RepoInfo | null> =>
      ipcRenderer.invoke(IPC.REPO_HEAD),
    setActive: (path: string): Promise<RepoInfo | null> =>
      ipcRenderer.invoke(IPC.REPO_SET_ACTIVE, path),
    list: (): Promise<RepoInfo[]> =>
      ipcRenderer.invoke(IPC.REPO_LIST),
    trust: (path?: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.REPO_TRUST, path),
  },

  diff: {
    file: (input: DiffFileInput): Promise<DiffResult> =>
      ipcRenderer.invoke(IPC.DIFF_FILE, input),
    commitFiles: (input: CommitFilesInput): Promise<DiffFile[]> =>
      ipcRenderer.invoke(IPC.COMMIT_FILES, input),
    fileContent: (input: FileContentInput): Promise<FileContentResult> =>
      ipcRenderer.invoke(IPC.FILE_CONTENT, input),
    commits: (input: { base: string; ref: string; paths?: string[] }): Promise<import('@shared/git').DiffResult[]> =>
      ipcRenderer.invoke(IPC.DIFF_COMMITS, input),
    blame: (input: { path: string; ref?: string }): Promise<import('@shared/ipc').BlameEntry[]> =>
      ipcRenderer.invoke(IPC.DIFF_BLAME, input),
  },

  workingTree: {
    stage: (paths: string[]): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_STAGE, { paths }),
    stageAll: (): Promise<WriteResult> =>
      ipcRenderer.invoke('workingTree:stageAll'),
    unstage: (paths: string[]): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_UNSTAGE, { paths }),
    unstageAll: (): Promise<WriteResult> =>
      ipcRenderer.invoke('workingTree:unstageAll'),
    discard: (paths: string[]): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_DISCARD, { paths }),
    discardUntracked: (paths: string[]): Promise<WriteResult> =>
      ipcRenderer.invoke('workingTree:discardUntracked', { paths }),
    discardAllUnstaged: (): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_DISCARD_ALL_UNSTAGED),
    stageHunks: (path: string, patch: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_STAGE_HUNKS, { path, patch }),
    unstageHunks: (path: string, patch: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_UNSTAGE_HUNKS, { path, patch }),
    ignore: (repoPath: string, pattern: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_IGNORE, { repoPath, pattern }),
    stashFile: (repoPath: string, filePath: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_STASH_FILE, { repoPath, filePath }),
    createPatch: (repoPath: string, filePath: string): Promise<{ success: boolean; cancelled?: boolean }> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_CREATE_PATCH, { repoPath, filePath }),
    deleteFile: (repoPath: string, filePath: string, staged: boolean): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_DELETE_FILE, { repoPath, filePath, staged }),
    openInEditor: (filePath: string, editor: string | null): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_OPEN_IN_EDITOR, { filePath, editor }),
  },

  commit: {
    create: (input: CommitCreateInput): Promise<WriteResult<CommitResultData>> =>
      ipcRenderer.invoke(IPC.COMMIT_CREATE, input),
    verify: (input: VerifyCommitInput): Promise<{ verified: boolean; signer: string }> =>
      ipcRenderer.invoke(IPC.COMMIT_VERIFY, input),
  },

  branch: {
    checkout: (input: BranchCheckoutInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.BRANCH_CHECKOUT, input),
    create: (input: BranchCreateInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.BRANCH_CREATE, input),
    delete: (input: BranchDeleteInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.BRANCH_DELETE, input),
    rename: (oldName: string, newName: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.BRANCH_RENAME, { oldName, newName }),
    setUpstream: (branch: string, upstream: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.BRANCH_SET_UPSTREAM, { branch, upstream }),
    reset: (ref: string, mode: 'soft' | 'mixed' | 'hard' | 'keep'): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.BRANCH_RESET, { ref, mode }),
  },

  remote: {
    fetch: (input: RemoteFetchInput): Promise<WriteResult<FetchResultData>> =>
      ipcRenderer.invoke(IPC.REMOTE_FETCH, input),
    pull: (input: RemotePullInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.REMOTE_PULL, input),
    push: (input: RemotePushInput): Promise<WriteResult<PushResultData>> =>
      ipcRenderer.invoke(IPC.REMOTE_PUSH, input),
    add: (name: string, url: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.REMOTE_ADD, { name, url }),
    remove: (name: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.REMOTE_REMOVE, { name }),
    setUrl: (name: string, url: string, push?: boolean): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.REMOTE_SET_URL, { name, url, push }),
    fetchAll: (prune?: boolean): Promise<WriteResult<{ fetched: number }>> =>
      ipcRenderer.invoke(IPC.REMOTE_FETCH_ALL, { prune: prune ?? false }),
  },

  stash: {
    list: (): Promise<StashEntry[]> =>
      ipcRenderer.invoke(IPC.STASH_LIST),
    create: (input: StashCreateInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.STASH_CREATE, input),
    apply: (input: StashApplyInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.STASH_APPLY, input),
    pop: (input: StashApplyInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.STASH_POP, input),
    drop: (input: StashRefInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.STASH_DROP, input),
    diff: (input: StashDiffInput): Promise<string> =>
      ipcRenderer.invoke(IPC.STASH_DIFF, input),
  },

  operations: {
    merge: (input: BranchMergeInput): Promise<WriteResult<MergeResultData>> =>
      ipcRenderer.invoke(IPC.BRANCH_MERGE, input),
    rebase: (input: BranchRebaseInput): Promise<WriteResult<RebaseResultData>> =>
      ipcRenderer.invoke(IPC.BRANCH_REBASE, input),
    cherryPick: (input: CherryPickInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.COMMIT_CHERRY_PICK, input),
    revert: (shas: string[], noCommit?: boolean): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.COMMIT_REVERT, { shas, noCommit }),
    mergePreview: (input: { ref: string }): Promise<MergePreview> =>
      ipcRenderer.invoke(IPC.OPERATION_MERGE_PREVIEW, input),
    pullPreview: (input: { remote?: string; branch?: string }): Promise<PullPreview> =>
      ipcRenderer.invoke(IPC.OPERATION_PULL_PREVIEW, input),
    pushPreview: (input: { remote?: string; branch?: string }): Promise<PushPreview> =>
      ipcRenderer.invoke(IPC.OPERATION_PUSH_PREVIEW, input),
    rebasePlan: (input: { onto: string }): Promise<RebasePlan> =>
      ipcRenderer.invoke(IPC.OPERATION_REBASE_PLAN, input),
    abort: (input: OperationInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.OPERATION_ABORT, input),
    continue: (input: OperationInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.OPERATION_CONTINUE, input),
    skip: (input: OperationInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.OPERATION_SKIP, input),
    undo: (input: { kind: string; branch?: string; sha?: string }): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.OPERATION_UNDO, input),
  },

  conflict: {
    file: (path: string): Promise<{ path: string; blocks: any[] }> =>
      ipcRenderer.invoke(IPC.CONFLICT_FILE, { path }),
    resolve: (path: string, content: string): Promise<{ success: boolean; stdout: string; stderr: string }> =>
      ipcRenderer.invoke(IPC.CONFLICT_RESOLVE, { path, content }),
    versions: (path: string): Promise<import('@shared/ipc').ConflictVersionsResult> =>
      ipcRenderer.invoke(IPC.CONFLICT_VERSIONS, { path }),
  },

  rebaseInteractive: {
    plan: (input: { onto: string }): Promise<import('@shared/ipc').RebaseInteractivePlan> =>
      ipcRenderer.invoke(IPC.BRANCH_REBASE_INTERACTIVE, input),
    apply: (input: { onto: string; items: { action: string; sha: string }[] }): Promise<import('@shared/ipc').WriteResult<import('@shared/ipc').RebaseResultData>> =>
      ipcRenderer.invoke(IPC.REBASE_INTERACTIVE_APPLY, input),
  },

  auth: {
    status: (): Promise<{ credentials: { type: string; exists: boolean; path?: string }[]; credentialHelpers: string[] }> =>
      ipcRenderer.invoke(IPC.AUTH_STATUS),
    testRemote: (url: string): Promise<{ success: boolean; message: string }> =>
      ipcRenderer.invoke(IPC.AUTH_TEST_REMOTE, { url }),
  },

  worktree: {
    list: (): Promise<Worktree[]> =>
      ipcRenderer.invoke(IPC.WORKTREE_LIST),
    create: (input: WorktreeCreateInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKTREE_CREATE, input),
    remove: (input: WorktreeRemoveInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKTREE_REMOVE, input),
    prune: (): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKTREE_PRUNE),
    lock: (path: string, reason?: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKTREE_LOCK, { path, reason }),
    unlock: (path: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKTREE_UNLOCK, { path }),
    removeAndDelete: (path: string, branch: string, force?: boolean): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKTREE_REMOVE_AND_DELETE_BRANCH, { path, branch, force: force ?? false }),
  },

  settings: {
    get: (): Promise<SettingsData> =>
      ipcRenderer.invoke(IPC.SETTINGS_GET),
    set: (input: SettingsSetInput): Promise<SettingsData> =>
      ipcRenderer.invoke(IPC.SETTINGS_SET, input),
    recentRepos: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC.SETTINGS_RECENT_REPOS),
    addRecent: (path: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.SETTINGS_ADD_RECENT, path),
    removeRecent: (path: string): Promise<string[]> =>
      ipcRenderer.invoke(IPC.SETTINGS_REMOVE_RECENT, path),
  },

  log: {
    subscribe: (
      onEntry: (entry: LogEntry) => void,
    ): Promise<{ success: boolean }> => {
      const handler = (_e: IpcRendererEvent, entry: LogEntry) => onEntry(entry);
      ipcRenderer.on(IPC.LOG_EVENT, handler);
      return ipcRenderer.invoke(IPC.LOG_SUBSCRIBE);
    },
    unsubscribe: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.LOG_UNSUBSCRIBE),
  },

  watch: {
    onEvent: (cb: (evt: WatchEvent) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, evt: WatchEvent) => cb(evt);
      ipcRenderer.on(IPC.WATCH_EVENT, handler);
      return () => ipcRenderer.off(IPC.WATCH_EVENT, handler);
    },
  },

  terminal: {
    run: (command: string): Promise<{ exitCode: number }> =>
      ipcRenderer.invoke(IPC.TERMINAL_RUN, command),
    kill: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.TERMINAL_KILL),
    onData: (cb: (data: { text: string; isError: boolean }) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, data: { text: string; isError: boolean }) => cb(data);
      ipcRenderer.on('terminal:data', handler);
      return () => ipcRenderer.off('terminal:data', handler);
    },
    onExit: (cb: (data: { exitCode: number }) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, data: { exitCode: number }) => cb(data);
      ipcRenderer.on('terminal:exit', handler);
      return () => ipcRenderer.off('terminal:exit', handler);
    },
  },

  compare: {
    branches: (input: BranchCompareInput): Promise<BranchCompareResult> =>
      ipcRenderer.invoke(IPC.BRANCH_COMPARE, input),
  },

  dialog: {
    pickRepo: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickRepo'),
    pickDirectory: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickDirectory'),
  },

  shell: {
    openPath: (path: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.SHELL_OPEN_PATH, { path }),
    showItemInFolder: (filePath: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.SHELL_SHOW_ITEM_IN_FOLDER, { filePath }),
  },

  submodule: {
    list: (): Promise<{ path: string; url: string; branch: string; sha: string }[]> =>
      ipcRenderer.invoke(IPC.SUBMODULE_LIST),
    init: (recursive?: boolean): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.SUBMODULE_INIT, { recursive: recursive ?? true }),
    deinit: (path: string, force?: boolean): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.SUBMODULE_DEINIT, { path, force: force ?? false }),
  },

  lfs: {
    list: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC.LFS_LIST),
    track: (pattern: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.LFS_TRACK, { pattern }),
    untrack: (pattern: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.LFS_UNTRACK, { pattern }),
  },

  updater: {
    onEvent: (cb: (event: UpdaterEvent) => void): (() => void) => {
      const handler = (_e: IpcRendererEvent, event: UpdaterEvent) => cb(event);
      ipcRenderer.on(IPC.UPDATER_EVENT, handler);
      return () => ipcRenderer.off(IPC.UPDATER_EVENT, handler);
    },
    check: (): Promise<UpdaterCheckResult> =>
      ipcRenderer.invoke(IPC.UPDATER_CHECK),
  },

  // CLI: listen for repo open requests from main process (second-instance).
  onOpenRepo: (cb: (path: string) => void): (() => void) => {
    const handler = (_e: IpcRendererEvent, path: string) => cb(path);
    ipcRenderer.on('open-repo', handler);
    return () => ipcRenderer.off('open-repo', handler);
  },

  // Re-hydrate GitError from serialized form. Renderer imports this.
  rehydrateError: (x: unknown): Error => {
    if (x && typeof x === 'object' && (x as { name?: string }).name === 'GitError') {
      return new GitError(x as ConstructorParameters<typeof GitError>[0]);
    }
    return x as Error;
  },
} as const;

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;

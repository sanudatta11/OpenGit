// electron/preload/index.ts — contextBridge exposure. Mirrors shared/ipc.ts.
// Sandbox-safe: only ipcRenderer.invoke/on, no Node APIs exposed.

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IPC, GitError } from '@shared/ipc';
import type { WatchEvent } from '@shared/ipc';
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
  MergeResultData,
  RebaseResultData,
  WorktreeCreateInput,
  WorktreeRemoveInput,
  SettingsSetInput,
  SettingsData,
} from '@shared/ipc';

export interface FileContentResult {
  content: string;
  isBinary: boolean;
  truncated: boolean;
  sizeBytes: number;
}

const api = {
  repo: {
    open: (path: string): Promise<RepoInfo> =>
      ipcRenderer.invoke(IPC.REPO_OPEN, { path } satisfies RepoOpenInput),
    close: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke(IPC.REPO_CLOSE),
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
  },

  diff: {
    file: (input: DiffFileInput): Promise<DiffResult> =>
      ipcRenderer.invoke(IPC.DIFF_FILE, input),
    commitFiles: (input: CommitFilesInput): Promise<DiffFile[]> =>
      ipcRenderer.invoke(IPC.COMMIT_FILES, input),
    fileContent: (input: FileContentInput): Promise<FileContentResult> =>
      ipcRenderer.invoke(IPC.FILE_CONTENT, input),
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
    stageHunks: (path: string, patch: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_STAGE_HUNKS, { path, patch }),
    unstageHunks: (path: string, patch: string): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.WORKING_TREE_UNSTAGE_HUNKS, { path, patch }),
  },

  commit: {
    create: (input: CommitCreateInput): Promise<WriteResult<CommitResultData>> =>
      ipcRenderer.invoke(IPC.COMMIT_CREATE, input),
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
  },

  remote: {
    fetch: (input: RemoteFetchInput): Promise<WriteResult<FetchResultData>> =>
      ipcRenderer.invoke(IPC.REMOTE_FETCH, input),
    pull: (input: RemotePullInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.REMOTE_PULL, input),
    push: (input: RemotePushInput): Promise<WriteResult<PushResultData>> =>
      ipcRenderer.invoke(IPC.REMOTE_PUSH, input),
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
    abort: (input: OperationInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.OPERATION_ABORT, input),
    continue: (input: OperationInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.OPERATION_CONTINUE, input),
    skip: (input: OperationInput): Promise<WriteResult> =>
      ipcRenderer.invoke(IPC.OPERATION_SKIP, input),
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

  dialog: {
    pickRepo: (): Promise<string | null> => ipcRenderer.invoke('dialog:pickRepo'),
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

// src/stores/repo.ts — open repos (multi-repo with tabs) + UI state.

import { create } from 'zustand';
import type { RepoInfo, Commit } from '@shared/git';

export type MainView =
  | { kind: 'graph' }
  | { kind: 'working-tree-diff'; path: string; source: 'staged' | 'unstaged' }
  | { kind: 'commit-details'; sha: string }
  | { kind: 'commit-file-diff'; sha: string; path: string }
  | { kind: 'compare' }
  | { kind: 'operation-actions' };

export function repoName(info: RepoInfo): string {
  return info.path.split('/').pop() ?? info.path;
}

interface RepoStore {
  repos: RepoInfo[];
  activeIndex: number;
  activeRepo: RepoInfo | null;

  addRepo: (info: RepoInfo) => void;
  switchRepo: (path: string) => void;
  closeRepo: (path: string) => void;

  selectedCommitSha: string | null;
  selectCommit: (sha: string | null) => void;

  selectedFile: { path: string; staged: boolean; isCommit: boolean; sha?: string; oldPath?: string | null } | null;
  selectFile: (file: { path: string; staged: boolean; isCommit: boolean; sha?: string; oldPath?: string | null } | null) => void;

  mainView: MainView;
  setMainView: (view: MainView) => void;
  showGraph: () => void;
  openWorkingTreeDiff: (path: string, source: 'staged' | 'unstaged') => void;
  openCommitDetails: (sha: string) => void;

  fileHistoryPath: string | null;
  setFileHistory: (path: string | null) => void;

  logDrawerOpen: boolean;
  toggleLogDrawer: (open?: boolean) => void;

  sidebarTab: SidebarTab;
  setSidebarTab: (t: SidebarTab) => void;

  sidebarCollapsed: boolean;
  toggleSidebarCollapsed: () => void;

  isSwitchingRepo: boolean;
  repoSwitchTargetPath: string | null;
  repoSwitchPhase: 'idle' | 'switching' | 'settling' | 'failed';
  beginRepoSwitch: (path: string) => void;
  markRepoSwitchSettling: () => void;
  completeRepoSwitch: () => void;
  failRepoSwitch: () => void;
  resetTransientViewState: () => void;
}

export type SidebarTab = 'branches' | 'remotes' | 'stash' | 'worktrees' | 'submodules' | 'lfs' | 'actions';

export const useRepoStore = create<RepoStore>((set) => ({
  repos: [],
  activeIndex: -1,
  activeRepo: null,

  addRepo: (info) =>
    set((s) => {
      const existing = s.repos.findIndex((r) => r.path === info.path);
      if (existing !== -1) {
        // Already open → just switch to it.
        const updated = [
          ...s.repos.slice(0, existing),
          info,
          ...s.repos.slice(existing + 1),
        ];
        return {
          repos: updated,
          activeIndex: existing,
          activeRepo: info,
          mainView: { kind: 'graph' },
          selectedCommitSha: null,
          selectedFile: null,
        };
      }
      return {
        repos: [...s.repos, info],
        activeIndex: s.repos.length,
        activeRepo: info,
        mainView: { kind: 'graph' },
        selectedCommitSha: null,
        selectedFile: null,
      };
    }),

  switchRepo: (path) =>
    set((s) => {
      const idx = s.repos.findIndex((r) => r.path === path);
      if (idx === -1) return s;
      return {
        activeIndex: idx,
        activeRepo: s.repos[idx]!,
        mainView: { kind: 'graph' },
        selectedCommitSha: null,
        selectedFile: null,
        fileHistoryPath: null,
      };
    }),

  closeRepo: (path) =>
    set((s) => {
      const idx = s.repos.findIndex((r) => r.path === path);
      if (idx === -1) return s;
      const next = [...s.repos.slice(0, idx), ...s.repos.slice(idx + 1)];
      let newIdx = s.activeIndex;
      if (idx < newIdx || (idx === newIdx && next.length > 0)) newIdx = Math.min(idx, next.length - 1);
      else if (next.length === 0) newIdx = -1;
      return {
        repos: next,
        activeIndex: newIdx,
        activeRepo: next[newIdx] ?? null,
        selectedCommitSha: null,
        selectedFile: null,
        fileHistoryPath: null,
        mainView: { kind: 'graph' },
      };
    }),

  selectedCommitSha: null,
  selectCommit: (sha) => set({
    selectedCommitSha: sha,
    selectedFile: null,
    mainView: sha ? { kind: 'commit-details', sha } : { kind: 'graph' },
  }),

  selectedFile: null,
  selectFile: (file) => set({ selectedFile: file }),

  mainView: { kind: 'graph' },
  setMainView: (view) => set({ mainView: view }),
  showGraph: () => set({ mainView: { kind: 'graph' } }),
  openWorkingTreeDiff: (path, source) => set({
    mainView: { kind: 'working-tree-diff', path, source },
    selectedFile: { path, staged: source === 'staged', isCommit: false },
  }),
  openCommitDetails: (sha) => set({
    mainView: { kind: 'commit-details', sha },
    selectedCommitSha: sha,
    selectedFile: null,
  }),

  fileHistoryPath: null,
  setFileHistory: (path) => set({ fileHistoryPath: path }),

  logDrawerOpen: false,
  toggleLogDrawer: (open) => set((s) => ({ logDrawerOpen: open ?? !s.logDrawerOpen })),

  sidebarTab: 'branches',
  setSidebarTab: (t) => set({ sidebarTab: t }),

  sidebarCollapsed: false,
  toggleSidebarCollapsed: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  isSwitchingRepo: false,
  repoSwitchTargetPath: null,
  repoSwitchPhase: 'idle',
  beginRepoSwitch: (path) => set({
    isSwitchingRepo: true,
    repoSwitchTargetPath: path,
    repoSwitchPhase: 'switching',
    selectedCommitSha: null,
    selectedFile: null,
    fileHistoryPath: null,
    logDrawerOpen: false,
    mainView: { kind: 'graph' },
  }),
  markRepoSwitchSettling: () => set((s) => (
    s.isSwitchingRepo
      ? { repoSwitchPhase: 'settling' }
      : s
  )),
  completeRepoSwitch: () => set({
    isSwitchingRepo: false,
    repoSwitchTargetPath: null,
    repoSwitchPhase: 'idle',
  }),
  failRepoSwitch: () => set({
    isSwitchingRepo: false,
    repoSwitchTargetPath: null,
    repoSwitchPhase: 'failed',
  }),
  resetTransientViewState: () => set({
    selectedCommitSha: null,
    selectedFile: null,
    fileHistoryPath: null,
    logDrawerOpen: false,
    mainView: { kind: 'graph' },
  }),
}));

// Commit cache: repoPath:sha -> Commit.
const commitCache = new Map<string, Commit>();

function commitCacheKey(repoPath: string, sha: string): string {
  return `${repoPath}::${sha}`;
}

export function cacheCommits(repoPath: string, commits: readonly Commit[]): void {
  for (const c of commits) commitCache.set(commitCacheKey(repoPath, c.sha), c);
}

export function getCachedCommit(repoPath: string, sha: string): Commit | undefined {
  return commitCache.get(commitCacheKey(repoPath, sha));
}

export function clearRepoCommitCache(repoPath: string): void {
  const prefix = `${repoPath}::`;
  for (const key of commitCache.keys()) {
    if (key.startsWith(prefix)) commitCache.delete(key);
  }
}

export function clearAllCommitCachesExcept(repoPath: string): void {
  const prefix = `${repoPath}::`;
  for (const key of commitCache.keys()) {
    if (!key.startsWith(prefix)) commitCache.delete(key);
  }
}

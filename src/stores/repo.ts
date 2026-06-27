import { create } from 'zustand';
import type { RepoInfo, Commit } from '@shared/git';

export type MainView =
  | { kind: 'graph' }
  | { kind: 'working-tree-diff'; path: string; source: 'staged' | 'unstaged' }
  | { kind: 'commit-details'; sha: string }
  | { kind: 'commit-file-diff'; sha: string; path: string }
  | { kind: 'compare' }
  | { kind: 'operation-actions' };

export type SidebarTab = 'branches' | 'remotes' | 'stash' | 'worktrees' | 'submodules' | 'lfs' | 'actions';

export interface DashboardTab {
  id: string;
  kind: 'dashboard';
}

export interface RepoTab {
  id: string;
  kind: 'repo';
  repoPath: string;
  loaded: boolean;
  repoInfo?: RepoInfo;
}

export type AppTab = DashboardTab | RepoTab;

export interface PersistedRepoTab {
  id: string;
  kind: 'repo';
  repoPath: string;
  loaded?: boolean;
}

export interface PersistedDashboardTab {
  id: string;
  kind: 'dashboard';
}

export type PersistedAppTab = PersistedDashboardTab | PersistedRepoTab;

export interface PersistedTabSession {
  tabs: PersistedAppTab[];
  activeTabId: string | null;
  nextTabSequence?: number;
}

export function repoName(info: RepoInfo): string {
  return info.path.split('/').pop() ?? info.path;
}

interface RepoStore {
  tabs: AppTab[];
  activeTabId: string | null;
  nextTabSequence: number;
  activeRepo: RepoInfo | null;

  openDashboardTab: () => string;
  activateTab: (tabId: string) => void;
  hydrateRepoTab: (tabId: string, info: RepoInfo) => void;
  createPlaceholderRepoTab: (repoPath: string) => string;
  focusRepoTab: (repoPath: string) => string | null;
  closeTab: (tabId: string) => AppTab | null;
  rehydrateSession: (session: { tabs: AppTab[]; activeTabId: string | null; nextTabSequence?: number }) => void;
  reorderTabs: (startIndex: number, endIndex: number) => void;
  serializeSession: () => PersistedTabSession;

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
  commitSummary: string;
  commitDescription: string;
  setCommitSummary: (val: string) => void;
  setCommitDescription: (val: string) => void;
}

function makeDashboardTabId(sequence: number): string {
  return `dashboard-${sequence}`;
}

function findActiveRepo(tabs: AppTab[], activeTabId: string | null): RepoInfo | null {
  if (!activeTabId) return null;
  const activeTab = tabs.find((tab) => tab.id === activeTabId);
  return activeTab?.kind === 'repo' && activeTab.loaded ? activeTab.repoInfo ?? null : null;
}

function sanitizeSessionTabs(tabs: AppTab[]): AppTab[] {
  const seenRepoPaths = new Set<string>();
  const out: AppTab[] = [];

  for (const tab of tabs) {
    if (tab.kind === 'dashboard') {
      out.push(tab);
      continue;
    }
    if (seenRepoPaths.has(tab.repoPath)) continue;
    seenRepoPaths.add(tab.repoPath);
    out.push(tab);
  }

  return out;
}

export const useRepoStore = create<RepoStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  nextTabSequence: 1,
  activeRepo: null,

  openDashboardTab: () => {
    const tabId = makeDashboardTabId(get().nextTabSequence);
    set((state) => ({
      tabs: [...state.tabs, { id: tabId, kind: 'dashboard' }],
      activeTabId: tabId,
      nextTabSequence: state.nextTabSequence + 1,
      activeRepo: null,
      mainView: { kind: 'graph' },
      selectedCommitSha: null,
      selectedFile: null,
      fileHistoryPath: null,
    }));
    return tabId;
  },

  activateTab: (tabId) =>
    set((state) => {
      if (!state.tabs.some((tab) => tab.id === tabId)) return state;
      const activeRepo = findActiveRepo(state.tabs, tabId);
      return {
        activeTabId: tabId,
        activeRepo,
        mainView: { kind: 'graph' },
        selectedCommitSha: null,
        selectedFile: null,
        fileHistoryPath: null,
      };
    }),

  hydrateRepoTab: (tabId, info) =>
    set((state) => {
      const existingRepoTab = state.tabs.find((tab) => tab.kind === 'repo' && tab.repoPath === info.path);
      const tabs = state.tabs.map((tab) => {
        if (tab.id === tabId) {
          return {
            id: tabId,
            kind: 'repo',
            repoPath: info.path,
            loaded: true,
            repoInfo: info,
          } satisfies RepoTab;
        }
        if (tab.kind === 'repo' && tab.repoPath === info.path) {
          return {
            ...tab,
            loaded: true,
            repoInfo: info,
          };
        }
        return tab;
      });

      const dedupedTabs = sanitizeSessionTabs(tabs);
      const nextActiveTabId = existingRepoTab && existingRepoTab.id !== tabId ? existingRepoTab.id : tabId;

      return {
        tabs: dedupedTabs,
        activeTabId: nextActiveTabId,
        activeRepo: info,
        mainView: { kind: 'graph' },
        selectedCommitSha: null,
        selectedFile: null,
        fileHistoryPath: null,
      };
    }),

  createPlaceholderRepoTab: (repoPath) => {
    const existing = get().focusRepoTab(repoPath);
    if (existing) return existing;

    const tabId = `repo-${repoPath}`;
    set((state) => ({
      tabs: [...state.tabs, { id: tabId, kind: 'repo', repoPath, loaded: false }],
      activeTabId: state.activeTabId ?? tabId,
      activeRepo: findActiveRepo([...state.tabs, { id: tabId, kind: 'repo', repoPath, loaded: false }], state.activeTabId ?? tabId),
    }));
    return tabId;
  },

  focusRepoTab: (repoPath) => {
    const tab = get().tabs.find((entry) => entry.kind === 'repo' && entry.repoPath === repoPath);
    if (!tab) return null;
    get().activateTab(tab.id);
    return tab.id;
  },

  closeTab: (tabId) => {
    const state = get();
    const closing = state.tabs.find((tab) => tab.id === tabId) ?? null;
    if (!closing) return null;

    let nextTabs = state.tabs.filter((tab) => tab.id !== tabId);
    let nextActiveTabId = state.activeTabId;
    if (state.activeTabId === tabId) {
      const closingIndex = state.tabs.findIndex((tab) => tab.id === tabId);
      nextActiveTabId = nextTabs[Math.min(closingIndex, nextTabs.length - 1)]?.id ?? null;
    }

    let nextTabSequence = state.nextTabSequence;
    if (nextTabs.length === 0) {
      const fallbackId = makeDashboardTabId(state.nextTabSequence);
      nextTabs = [{ id: fallbackId, kind: 'dashboard' }];
      nextActiveTabId = fallbackId;
      nextTabSequence = state.nextTabSequence + 1;
    }

    set({
      tabs: nextTabs,
      activeTabId: nextActiveTabId,
      nextTabSequence,
      activeRepo: findActiveRepo(nextTabs, nextActiveTabId),
      mainView: { kind: 'graph' },
      selectedCommitSha: null,
      selectedFile: null,
      fileHistoryPath: null,
    });

    return closing;
  },

  rehydrateSession: (session) => {
    const tabs = sanitizeSessionTabs(session.tabs);
    const activeTabId = session.activeTabId && tabs.some((tab) => tab.id === session.activeTabId)
      ? session.activeTabId
      : tabs[0]?.id ?? null;
    set({
      tabs,
      activeTabId,
      nextTabSequence: session.nextTabSequence ?? (tabs.length + 1),
      activeRepo: findActiveRepo(tabs, activeTabId),
      selectedCommitSha: null,
      selectedFile: null,
      mainView: { kind: 'graph' },
      fileHistoryPath: null,
      logDrawerOpen: false,
      isSwitchingRepo: false,
      repoSwitchTargetPath: null,
      repoSwitchPhase: 'idle',
    });
  },

  serializeSession: () => {
    const state = get();
    return {
      tabs: state.tabs.map((tab) => (
        tab.kind === 'dashboard'
          ? { id: tab.id, kind: 'dashboard' }
          : { id: tab.id, kind: 'repo', repoPath: tab.repoPath, loaded: tab.loaded }
      )),
      activeTabId: state.activeTabId,
      nextTabSequence: state.nextTabSequence,
    };
  },

  reorderTabs: (startIndex, endIndex) =>
    set((state) => {
      const nextTabs = [...state.tabs];
      const [moved] = nextTabs.splice(startIndex, 1);
      if (moved) {
        nextTabs.splice(endIndex, 0, moved);
      }
      return { tabs: nextTabs };
    }),

  addRepo: (info) => {
    const state = get();
    const activeTab = state.tabs.find((tab) => tab.id === state.activeTabId);
    if (activeTab?.kind === 'dashboard') {
      state.hydrateRepoTab(activeTab.id, info);
      return;
    }

    const existing = state.tabs.find((tab) => tab.kind === 'repo' && tab.repoPath === info.path);
    if (existing) {
      state.hydrateRepoTab(existing.id, info);
      return;
    }

    const tabId = `repo-${info.path}`;
    set((current) => ({
      tabs: [...current.tabs, { id: tabId, kind: 'repo', repoPath: info.path, loaded: true, repoInfo: info }],
      activeTabId: tabId,
      activeRepo: info,
      mainView: { kind: 'graph' },
      selectedCommitSha: null,
      selectedFile: null,
      fileHistoryPath: null,
    }));
  },

  switchRepo: (path) => {
    get().focusRepoTab(path);
  },

  closeRepo: (path) => {
    const tab = get().tabs.find((entry) => entry.kind === 'repo' && entry.repoPath === path);
    if (tab) get().closeTab(tab.id);
  },

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
    commitSummary: '',
    commitDescription: '',
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
    commitSummary: '',
    commitDescription: '',
  }),
  commitSummary: '',
  commitDescription: '',
  setCommitSummary: (val) => set({ commitSummary: val }),
  setCommitDescription: (val) => set({ commitDescription: val }),
}));

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

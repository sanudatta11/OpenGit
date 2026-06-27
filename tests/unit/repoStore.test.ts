import { beforeEach, describe, expect, it } from 'vitest';
import type { RepoInfo } from '../../shared/git';
import {
  cacheCommits,
  clearRepoCommitCache,
  getCachedCommit,
  useRepoStore,
  type RepoTab,
} from '../../src/stores/repo';
import { useGraphFilterStore } from '../../src/stores/graphFilter';

const repoA: RepoInfo = {
  path: '/tmp/repo-a',
  gitDir: '/tmp/repo-a/.git',
  isBare: false,
  isShallow: false,
  isDetached: false,
  headSha: 'aaaaaaa',
  currentBranch: 'main',
  gitVersion: '2.43.0',
};

const repoB: RepoInfo = {
  path: '/tmp/repo-b',
  gitDir: '/tmp/repo-b/.git',
  isBare: false,
  isShallow: false,
  isDetached: false,
  headSha: 'bbbbbbb',
  currentBranch: 'develop',
  gitVersion: '2.43.0',
};

function resetStore() {
  useRepoStore.setState({
    tabs: [],
    activeTabId: null,
    nextTabSequence: 1,
    selectedCommitSha: null,
    selectedFile: null,
    mainView: { kind: 'graph' },
    fileHistoryPath: null,
    logDrawerOpen: false,
    sidebarTab: 'branches',
    sidebarCollapsed: false,
    isSwitchingRepo: false,
    repoSwitchTargetPath: null,
    repoSwitchPhase: 'idle',
  });
}

function getRepoTab(path: string): RepoTab | undefined {
  return useRepoStore.getState().tabs.find((tab) => tab.kind === 'repo' && tab.repoPath === path) as RepoTab | undefined;
}

describe('repo store', () => {
  beforeEach(() => {
    resetStore();
    useGraphFilterStore.getState().clearAll();
    clearRepoCommitCache(repoA.path);
    clearRepoCommitCache(repoB.path);
  });

  it('opens dashboard tabs and activates the newest one', () => {
    const store = useRepoStore.getState();

    const firstId = store.openDashboardTab();
    const secondId = store.openDashboardTab();

    expect(useRepoStore.getState().tabs.map((tab) => tab.kind)).toEqual(['dashboard', 'dashboard']);
    expect(firstId).not.toBe(secondId);
    expect(useRepoStore.getState().activeTabId).toBe(secondId);
  });

  it('hydrates a dashboard tab into a repo tab and tracks the active repo', () => {
    const store = useRepoStore.getState();
    const dashboardId = store.openDashboardTab();

    store.hydrateRepoTab(dashboardId, repoA);

    const next = useRepoStore.getState();
    expect(next.activeRepo?.path).toBe(repoA.path);
    expect(next.tabs[0]).toMatchObject({
      id: dashboardId,
      kind: 'repo',
      repoPath: repoA.path,
      loaded: true,
    });
  });

  it('focuses an existing repo tab instead of creating a duplicate', () => {
    const store = useRepoStore.getState();
    const firstDashboard = store.openDashboardTab();
    store.hydrateRepoTab(firstDashboard, repoA);
    const secondDashboard = store.openDashboardTab();

    const focused = store.focusRepoTab(repoA.path);

    const next = useRepoStore.getState();
    expect(focused).toBe(firstDashboard);
    expect(next.activeTabId).toBe(firstDashboard);
    expect(next.tabs.filter((tab) => tab.kind === 'repo' && tab.repoPath === repoA.path)).toHaveLength(1);
    expect(next.tabs.find((tab) => tab.id === secondDashboard)?.kind).toBe('dashboard');
  });

  it('closes a non-active repo tab without changing the active repo payload', () => {
    const store = useRepoStore.getState();
    const firstDashboard = store.openDashboardTab();
    store.hydrateRepoTab(firstDashboard, repoA);
    const secondDashboard = store.openDashboardTab();
    store.hydrateRepoTab(secondDashboard, repoB);

    store.closeTab(firstDashboard);

    const next = useRepoStore.getState();
    expect(next.activeRepo?.path).toBe(repoB.path);
    expect(next.activeTabId).toBe(secondDashboard);
    expect(getRepoTab(repoA.path)).toBeUndefined();
    expect(getRepoTab(repoB.path)?.repoInfo?.currentBranch).toBe('develop');
  });

  it('preserves placeholder repo tabs during session rehydration', () => {
    const store = useRepoStore.getState();

    store.rehydrateSession({
      tabs: [
        { id: 'dashboard-1', kind: 'dashboard' },
        { id: 'repo-1', kind: 'repo', repoPath: repoA.path, loaded: true, repoInfo: repoA },
        { id: 'repo-2', kind: 'repo', repoPath: repoB.path, loaded: false },
      ],
      activeTabId: 'repo-1',
      nextTabSequence: 4,
    });

    const next = useRepoStore.getState();
    expect(next.activeRepo?.path).toBe(repoA.path);
    expect(getRepoTab(repoB.path)?.loaded).toBe(false);
    expect(getRepoTab(repoB.path)?.repoInfo).toBeUndefined();
  });

  it('clears transient selections during repo switch while preserving open tabs', () => {
    const store = useRepoStore.getState();
    const firstDashboard = store.openDashboardTab();
    store.hydrateRepoTab(firstDashboard, repoA);
    const secondDashboard = store.openDashboardTab();
    store.hydrateRepoTab(secondDashboard, repoB);
    store.selectCommit('deadbeef');
    store.selectFile({ path: 'file.ts', staged: false, isCommit: false });
    store.setFileHistory('file.ts');
    store.toggleLogDrawer(true);
    store.setMainView({ kind: 'working-tree-diff', path: 'file.ts', source: 'unstaged' });

    store.beginRepoSwitch(repoA.path);

    const next = useRepoStore.getState();
    expect(next.tabs).toHaveLength(2);
    expect(next.selectedCommitSha).toBeNull();
    expect(next.selectedFile).toBeNull();
    expect(next.fileHistoryPath).toBeNull();
    expect(next.logDrawerOpen).toBe(false);
    expect(next.mainView).toEqual({ kind: 'graph' });
    expect(next.repoSwitchTargetPath).toBe(repoA.path);
    expect(next.repoSwitchPhase).toBe('switching');
  });

  it('routes file and commit selections into central views', () => {
    const store = useRepoStore.getState();
    store.openWorkingTreeDiff('src/App.tsx', 'staged');
    expect(useRepoStore.getState().mainView).toEqual({
      kind: 'working-tree-diff',
      path: 'src/App.tsx',
      source: 'staged',
    });

    store.openCommitDetails('deadbeef');
    expect(useRepoStore.getState().mainView).toEqual({ kind: 'commit-details', sha: 'deadbeef' });
    expect(useRepoStore.getState().selectedCommitSha).toBe('deadbeef');
  });

  it('stores commit cache entries per repository path', () => {
    cacheCommits(repoA.path, [{
      sha: '1111111',
      parents: [],
      author: { name: 'A', email: 'a@example.com', date: new Date().toISOString() },
      committer: { name: 'A', email: 'a@example.com', date: new Date().toISOString() },
      subject: 'repo a',
      body: '',
      refs: [],
    }]);
    cacheCommits(repoB.path, [{
      sha: '1111111',
      parents: [],
      author: { name: 'B', email: 'b@example.com', date: new Date().toISOString() },
      committer: { name: 'B', email: 'b@example.com', date: new Date().toISOString() },
      subject: 'repo b',
      body: '',
      refs: [],
    }]);

    expect(getCachedCommit(repoA.path, '1111111')?.subject).toBe('repo a');
    expect(getCachedCommit(repoB.path, '1111111')?.subject).toBe('repo b');
  });

  it('resets graph filters when the active repo path changes', () => {
    const store = useRepoStore.getState();
    const firstDashboard = store.openDashboardTab();
    store.hydrateRepoTab(firstDashboard, repoA);
    useGraphFilterStore.getState().solo('main');
    const secondDashboard = store.openDashboardTab();
    store.hydrateRepoTab(secondDashboard, repoB);

    expect(useGraphFilterStore.getState().soloedRefs).toEqual([]);
  });
});

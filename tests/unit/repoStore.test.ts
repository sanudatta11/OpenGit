import { beforeEach, describe, expect, it } from 'vitest';
import type { RepoInfo } from '../../shared/git';
import {
  cacheCommits,
  clearRepoCommitCache,
  getCachedCommit,
  useRepoStore,
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

describe('repo store', () => {
  beforeEach(() => {
    useRepoStore.setState({
      repos: [],
      activeIndex: -1,
      activeRepo: null,
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
    useGraphFilterStore.getState().clearAll();
    clearRepoCommitCache(repoA.path);
    clearRepoCommitCache(repoB.path);
  });

  it('clears transient selections during repo switch while preserving open repos', () => {
    const store = useRepoStore.getState();
    store.addRepo(repoA);
    store.addRepo(repoB);
    store.selectCommit('deadbeef');
    store.selectFile({ path: 'file.ts', staged: false, isCommit: false });
    store.setFileHistory('file.ts');
    store.toggleLogDrawer(true);
    store.setMainView({ kind: 'working-tree-diff', path: 'file.ts', source: 'unstaged' });

    store.beginRepoSwitch(repoA.path);

    const next = useRepoStore.getState();
    expect(next.repos).toHaveLength(2);
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
    store.addRepo(repoA);
    useGraphFilterStore.getState().solo('main');

    store.addRepo(repoB);

    expect(useGraphFilterStore.getState().soloedRefs).toEqual([]);
  });
});

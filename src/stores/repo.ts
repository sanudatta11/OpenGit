// src/stores/repo.ts — currently-open repo + UI state (selected commit, log drawer).

import { create } from 'zustand';
import type { RepoInfo, Commit } from '@shared/git';

interface RepoStore {
  repo: RepoInfo | null;
  setRepo: (r: RepoInfo | null) => void;

  selectedCommitSha: string | null;
  selectCommit: (sha: string | null) => void;

  selectedFile: { path: string; staged: boolean; isCommit: boolean; sha?: string; oldPath?: string | null } | null;
  selectFile: (file: { path: string; staged: boolean; isCommit: boolean; sha?: string; oldPath?: string | null } | null) => void;

  fileHistoryPath: string | null;
  setFileHistory: (path: string | null) => void;

  logDrawerOpen: boolean;
  toggleLogDrawer: (open?: boolean) => void;

  sidebarTab: SidebarTab;
  setSidebarTab: (t: SidebarTab) => void;
}

export type SidebarTab = 'branches' | 'remotes' | 'stash' | 'worktrees' | 'submodules' | 'lfs' | 'actions';

export const useRepoStore = create<RepoStore>((set) => ({
  repo: null,
  setRepo: (r) => set({ repo: r }),

  selectedCommitSha: null,
  selectCommit: (sha) => set({ selectedCommitSha: sha, selectedFile: null }), // Clear file when commit changes

  selectedFile: null,
  selectFile: (file) => set({ selectedFile: file }),

  fileHistoryPath: null,
  setFileHistory: (path) => set({ fileHistoryPath: path }),

  logDrawerOpen: false,
  toggleLogDrawer: (open) =>
    set((s) => ({ logDrawerOpen: open ?? !s.logDrawerOpen })),

  sidebarTab: 'branches',
  setSidebarTab: (t) => set({ sidebarTab: t }),
}));

// Commit cache: sha → Commit. Populated when log query data arrives; used by
// the inspector to avoid re-fetching the selected commit.
const commitCache = new Map<string, Commit>();
export function cacheCommits(commits: readonly Commit[]): void {
  for (const c of commits) commitCache.set(c.sha, c);
}
export function getCachedCommit(sha: string): Commit | undefined {
  return commitCache.get(sha);
}

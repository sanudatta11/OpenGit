// src/stores/repo.ts — currently-open repo + UI state (selected commit, log drawer).

import { create } from 'zustand';
import type { RepoInfo, Commit } from '@shared/git';

interface RepoStore {
  repo: RepoInfo | null;
  setRepo: (r: RepoInfo | null) => void;

  selectedCommitSha: string | null;
  selectCommit: (sha: string | null) => void;

  logDrawerOpen: boolean;
  toggleLogDrawer: (open?: boolean) => void;

  sidebarTab: SidebarTab;
  setSidebarTab: (t: SidebarTab) => void;
}

export type SidebarTab = 'history' | 'branches' | 'remotes' | 'stash' | 'worktrees';

export const useRepoStore = create<RepoStore>((set) => ({
  repo: null,
  setRepo: (r) => set({ repo: r }),

  selectedCommitSha: null,
  selectCommit: (sha) => set({ selectedCommitSha: sha }),

  logDrawerOpen: false,
  toggleLogDrawer: (open) =>
    set((s) => ({ logDrawerOpen: open ?? !s.logDrawerOpen })),

  sidebarTab: 'history',
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

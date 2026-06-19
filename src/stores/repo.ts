// src/stores/repo.ts — open repos (multi-repo with tabs) + UI state.

import { create } from 'zustand';
import type { RepoInfo, Commit } from '@shared/git';

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

  fileHistoryPath: string | null;
  setFileHistory: (path: string | null) => void;

  logDrawerOpen: boolean;
  toggleLogDrawer: (open?: boolean) => void;

  sidebarTab: SidebarTab;
  setSidebarTab: (t: SidebarTab) => void;
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
        return { repos: updated, activeIndex: existing, activeRepo: info };
      }
      return {
        repos: [...s.repos, info],
        activeIndex: s.repos.length,
        activeRepo: info,
      };
    }),

  switchRepo: (path) =>
    set((s) => {
      const idx = s.repos.findIndex((r) => r.path === path);
      if (idx === -1) return s;
      return { activeIndex: idx, activeRepo: s.repos[idx]! };
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
      };
    }),

  selectedCommitSha: null,
  selectCommit: (sha) => set({ selectedCommitSha: sha, selectedFile: null }),

  selectedFile: null,
  selectFile: (file) => set({ selectedFile: file }),

  fileHistoryPath: null,
  setFileHistory: (path) => set({ fileHistoryPath: path }),

  logDrawerOpen: false,
  toggleLogDrawer: (open) => set((s) => ({ logDrawerOpen: open ?? !s.logDrawerOpen })),

  sidebarTab: 'branches',
  setSidebarTab: (t) => set({ sidebarTab: t }),
}));

// Commit cache: sha → Commit.
const commitCache = new Map<string, Commit>();
export function cacheCommits(commits: readonly Commit[]): void {
  for (const c of commits) commitCache.set(c.sha, c);
}
export function getCachedCommit(sha: string): Commit | undefined {
  return commitCache.get(sha);
}

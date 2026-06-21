// src/queries/useRepo.ts — TanStack Query hooks for repo reads, multi-repo aware.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../ipc/api';
import { qk } from './keys';
import { clearAllCommitCachesExcept, clearRepoCommitCache, useRepoStore } from '../stores/repo';
import { GitError } from '@shared/ipc';
import type { DiffFileInput, CommitFilesInput, FileContentInput } from '@shared/ipc';
import { useEffect } from 'react';

function activePath(): string | null {
  return useRepoStore.getState().activeRepo?.path ?? null;
}

function clearRepoBoundQueries(qc: { removeQueries: ReturnType<typeof useQueryClient>['removeQueries'] }, repoPath: string | null): void {
  if (!repoPath) return;
  void qc.removeQueries({
    predicate: (query) => Array.isArray(query.queryKey) && query.queryKey.includes(repoPath),
  });
}

export function useOpenRepo() {
  const addRepo = useRepoStore((s) => s.addRepo);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.repo.open(path),
    onSuccess: (info) => {
      addRepo(info);
      void qc.invalidateQueries({ queryKey: qk.status(info.path) });
      void qc.invalidateQueries({ queryKey: qk.branches(info.path) });
      void qc.invalidateQueries({ queryKey: qk.remotes(info.path) });
      void qc.invalidateQueries({ queryKey: qk.state(info.path) });
      void qc.removeQueries({ queryKey: ['log'] });
    },
  });
}

export function useSwitchRepo() {
  const switchRepo = useRepoStore((s) => s.switchRepo);
  const beginRepoSwitch = useRepoStore((s) => s.beginRepoSwitch);
  const markRepoSwitchSettling = useRepoStore((s) => s.markRepoSwitchSettling);
  const completeRepoSwitch = useRepoStore((s) => s.completeRepoSwitch);
  const failRepoSwitch = useRepoStore((s) => s.failRepoSwitch);
  const resetTransientViewState = useRepoStore((s) => s.resetTransientViewState);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.repo.setActive(path),
    onMutate: async (path) => {
      const currentPath = useRepoStore.getState().activeRepo?.path ?? null;
      beginRepoSwitch(path);
      await qc.cancelQueries();
      resetTransientViewState();
      clearRepoCommitCache(path);
      clearRepoBoundQueries(qc, currentPath);
    },
    onSuccess: async (info) => {
      if (!info) {
        failRepoSwitch();
        return;
      }
      switchRepo(info.path);
      clearAllCommitCachesExcept(info.path);
      markRepoSwitchSettling();
      await Promise.allSettled([
        qc.invalidateQueries({ queryKey: qk.status(info.path) }),
        qc.invalidateQueries({ queryKey: qk.branches(info.path) }),
        qc.invalidateQueries({ queryKey: qk.state(info.path) }),
        qc.invalidateQueries({ queryKey: qk.remotes(info.path) }),
        qc.invalidateQueries({ queryKey: qk.log(undefined, 0, 200, undefined, info.path) }),
      ]);
      completeRepoSwitch();
    },
    onError: () => {
      failRepoSwitch();
    },
  });
}

export function useCloseRepo() {
  const closeRepo = useRepoStore((s) => s.closeRepo);
  const switchRepoMut = useSwitchRepo();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      await api.repo.close();
      return path;
    },
    onSuccess: (_data, path) => {
      closeRepo(path);
      clearRepoCommitCache(path);
      clearRepoBoundQueries(qc, path);
      // If another repo is now active, switch to it.
      const next = useRepoStore.getState().activeRepo;
      if (next) switchRepoMut.mutate(next.path);
    },
  });
}

export function useRepoList() {
  return useQuery({
    queryKey: ['repoList'],
    queryFn: () => api.repo.list(),
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    // If we already have repos, just update them (don't replace).
    enabled: true,
    select: (data) => data,
  });
}

// Rehydrate open repos on app start.
export function useRehydrateRepos() {
  const addRepo = useRepoStore((s) => s.addRepo);
  const repos = useRepoStore((s) => s.repos);
  const list = useRepoList();

  useEffect(() => {
    if (list.data && repos.length === 0) {
      for (const info of list.data) {
        addRepo(info);
      }
    }
  }, [list.data]);
}

// Listen for repo open requests from CLI (second-instance -> main -> renderer).
export function useIpcRepoListener() {
  const openRepoMut = useOpenRepo();
  const switchRepoMut = useSwitchRepo();

  useEffect(() => {
    const unsub = api.onOpenRepo((path) => {
      // If repo is already open, just switch to it.
      const existing = useRepoStore.getState().repos.find((r) => r.path === path);
      if (existing) {
        switchRepoMut.mutate(path);
      } else {
        openRepoMut.mutate(path);
      }
    });
    return unsub;
  }, [openRepoMut, switchRepoMut]);
}

export function useStatus() {
  const path = activePath();
  return useQuery({
    queryKey: qk.status(path),
    queryFn: () => api.repo.status(),
    enabled: !!path,
    refetchOnWindowFocus: false,
  });
}

export function useBranches() {
  const path = activePath();
  return useQuery({
    queryKey: qk.branches(path),
    queryFn: () => api.repo.branches(),
    enabled: !!path,
    refetchOnWindowFocus: false,
  });
}

export function useRemotes() {
  const path = activePath();
  return useQuery({
    queryKey: qk.remotes(path),
    queryFn: () => api.repo.remotes(),
    enabled: !!path,
    refetchOnWindowFocus: false,
  });
}

export function useState() {
  const path = activePath();
  return useQuery({
    queryKey: qk.state(path),
    queryFn: () => api.repo.state(),
    enabled: !!path,
    refetchOnWindowFocus: false,
  });
}

export function useLog(range: string | undefined, skip: number, limit: number, paths?: string[]) {
  const path = activePath();
  return useQuery({
    queryKey: qk.log(range, skip, limit, paths, path),
    queryFn: () => api.repo.log({ range, skip, limit, paths }),
    enabled: !!path,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}

export function useRepoHead() {
  return useQuery({
    queryKey: ['repoHead'],
    queryFn: () => api.repo.head(),
    refetchOnWindowFocus: false,
  });
}

export function isGitError(x: unknown): x is GitError {
  return GitError.is(x);
}

// ── Diff + commit files + file content (Phase 2) ────────────────────────────

export function useCommitFiles(sha: string | null) {
  const path = activePath();
  return useQuery({
    queryKey: sha ? qk.commitFiles(sha, path) : ['commitFiles', 'none'],
    queryFn: () => api.diff.commitFiles({ sha: sha! } as CommitFilesInput),
    enabled: !!sha && !!path,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useDiff(input: DiffFileInput | null) {
  const path = activePath();
  return useQuery({
    queryKey: input ? qk.diff(input.path, input.ref, input.base, path) : ['diff', 'none'],
    queryFn: () => api.diff.file(input!),
    enabled: !!input && !!path,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useBranchCompare(branchA: string | null, branchB: string | null) {
  const path = activePath();
  return useQuery({
    queryKey: qk.branchCompare(branchA, branchB, path),
    queryFn: () => api.compare.branches({ branchA: branchA!, branchB: branchB! }),
    enabled: !!branchA && !!branchB && !!path,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}

export function useFileContent(input: { path: string; ref?: string; maxBytes?: number } | null) {
  const path = activePath();
  return useQuery({
    queryKey: input ? qk.fileContent(input.path, input.ref, path) : ['fileContent', 'none'],
    queryFn: () => api.diff.fileContent(input! as FileContentInput),
    enabled: !!input && !!path,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useBlame(filePath: string, ref?: string) {
  const path = activePath();
  return useQuery({
    queryKey: qk.blame(filePath, ref, path),
    queryFn: () => api.diff.blame({ path: filePath, ref }),
    enabled: !!filePath && !!path,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

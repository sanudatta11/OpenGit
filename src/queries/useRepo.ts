// src/queries/useRepo.ts — TanStack Query hooks for repo reads.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../ipc/api';
import { qk } from './keys';
import { useRepoStore } from '../stores/repo';
import { GitError } from '@shared/ipc';
import type { DiffFileInput, CommitFilesInput, FileContentInput } from '@shared/ipc';

export function useOpenRepo() {
  const setRepo = useRepoStore((s) => s.setRepo);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (path: string) => api.repo.open(path),
    onSuccess: (info) => {
      setRepo(info);
      // Reset queries for the new repo.
      void qc.invalidateQueries({ queryKey: qk.status });
      void qc.invalidateQueries({ queryKey: qk.branches });
      void qc.invalidateQueries({ queryKey: qk.remotes });
      void qc.invalidateQueries({ queryKey: qk.state });
      void qc.removeQueries({ queryKey: ['log'] });
    },
  });
}

export function useStatus() {
  return useQuery({
    queryKey: qk.status,
    queryFn: () => api.repo.status(),
    enabled: !!useRepoStore.getState().repo,
    refetchOnWindowFocus: false,
  });
}

export function useBranches() {
  return useQuery({
    queryKey: qk.branches,
    queryFn: () => api.repo.branches(),
    enabled: !!useRepoStore.getState().repo,
    refetchOnWindowFocus: false,
  });
}

export function useRemotes() {
  return useQuery({
    queryKey: qk.remotes,
    queryFn: () => api.repo.remotes(),
    enabled: !!useRepoStore.getState().repo,
    refetchOnWindowFocus: false,
  });
}

export function useState() {
  return useQuery({
    queryKey: qk.state,
    queryFn: () => api.repo.state(),
    enabled: !!useRepoStore.getState().repo,
    refetchOnWindowFocus: false,
  });
}

export function useLog(range: string | undefined, skip: number, limit: number, paths?: string[]) {
  return useQuery({
    queryKey: qk.log(range, skip, limit, paths),
    queryFn: () => api.repo.log({ range, skip, limit, paths }),
    enabled: !!useRepoStore.getState().repo,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}

export function useRepoHead() {
  return useQuery({
    queryKey: qk.repo,
    queryFn: () => api.repo.head(),
    refetchOnWindowFocus: false,
  });
}

export function isGitError(x: unknown): x is GitError {
  return GitError.is(x);
}

// ── Diff + commit files + file content (Phase 2) ────────────────────────────

export function useCommitFiles(sha: string | null) {
  return useQuery({
    queryKey: sha ? qk.commitFiles(sha) : ['commitFiles', 'none'],
    queryFn: () => api.diff.commitFiles({ sha: sha! } as CommitFilesInput),
    enabled: !!sha && !!useRepoStore.getState().repo,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useDiff(input: DiffFileInput | null) {
  return useQuery({
    queryKey: input ? qk.diff(input.path, input.ref, input.base) : ['diff', 'none'],
    queryFn: () => api.diff.file(input!),
    enabled: !!input && !!useRepoStore.getState().repo,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function useBranchCompare(branchA: string | null, branchB: string | null) {
  return useQuery({
    queryKey: qk.branchCompare(branchA, branchB),
    queryFn: () => api.compare.branches({ branchA: branchA!, branchB: branchB! }),
    enabled: !!branchA && !!branchB && !!useRepoStore.getState().repo,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}

export function useFileContent(input: { path: string; ref?: string; maxBytes?: number } | null) {
  return useQuery({
    queryKey: input ? qk.fileContent(input.path, input.ref) : ['fileContent', 'none'],
    queryFn: () => api.diff.fileContent(input! as FileContentInput),
    enabled: !!input && !!useRepoStore.getState().repo,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

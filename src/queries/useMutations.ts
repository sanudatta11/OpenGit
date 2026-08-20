// src/queries/useMutations.ts — TanStack Query mutation hooks for write operations.

import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import type { WriteResult } from '@shared/ipc';
import { api } from '../ipc/api';
import { qk } from './keys';
import { useRepoStore } from '../stores/repo';
import { useToastStore } from '../stores/toast';
import { usePushBannerStore } from '../stores/pushBanner';
import { useUndoStore, type UndoableAction } from '../stores/undo';
import type { UndoActionKind } from '@shared/ipc';

function activePath(): string | null {
  return useRepoStore.getState().activeRepo?.path ?? null;
}

// Input types with optional defaults (renderer-side; main fills in defaults via Zod).
interface CommitInput {
  message: string;
  amend?: boolean;
  signoff?: boolean;
  noVerify?: boolean;
  author?: { name: string; email: string };
  sign?: false | { method: 'gpg' | 'ssh'; key?: string };
}
interface CheckoutInput { ref: string; create?: boolean; force?: boolean }
interface CreateBranchInput { name: string; start?: string; checkout?: boolean }
interface DeleteBranchInput { name: string; force?: boolean }
interface CreateTagInput {
  name: string;
  start?: string;
  annotated?: boolean;
  message?: string;
  force?: boolean;
}
interface FetchInput { remote?: string; prune?: boolean }
interface PullInput { remote?: string; branch?: string; ffOnly?: boolean; strategy?: 'merge' | 'rebase' | 'ff-only' }
interface PushInput { remote?: string; branch?: string; forceWithLease?: boolean; setUpstream?: boolean }

// Helper: invalidate everything that a write might have changed.
function useRefreshOnSuccess() {
  const qc = useQueryClient();
  return (requiresRefresh?: boolean) => {
    if (requiresRefresh) {
      void qc.invalidateQueries({ queryKey: qk.status(activePath()) });
      void qc.invalidateQueries({ queryKey: qk.branches(activePath()) });
      void qc.invalidateQueries({ queryKey: qk.state(activePath()) });
      void qc.invalidateQueries({ queryKey: ['log'] });
    }
  };
}

type UndoDraft = Omit<UndoableAction, 'ts' | 'kind'> & { kind: UndoActionKind; ts?: number };

interface RepoMutationOptions<TVars, TData> {
  mutationFn: (vars: TVars) => Promise<WriteResult<TData>>;
  successToast?: (data: WriteResult<TData>, vars: TVars) => string;
  errorLabel?: string;
  undo?: (data: WriteResult<TData>, vars: TVars) => UndoDraft | null | undefined;
  /** Return true when failure was handled (e.g. push rejection banner). */
  onFailure?: (data: WriteResult<TData>, vars: TVars) => boolean;
  /** Extra invalidation beyond the default refresh helper. */
  onRefresh?: (data: WriteResult<TData>, vars: TVars) => void;
}

function useRepoMutation<TVars = void, TData = unknown>(opts: RepoMutationOptions<TVars, TData>) {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: opts.mutationFn,
    onSuccess: (result, vars) => {
      refresh(result.requiresRefresh);
      opts.onRefresh?.(result, vars);
      if (result.success) {
        if (opts.successToast) {
          useToastStore.getState().addToast(opts.successToast(result, vars), 'success');
        }
        const undo = opts.undo?.(result, vars);
        if (undo) {
          useUndoStore.getState().setLastAction({ ...undo, ts: undo.ts ?? Date.now() });
        }
        return;
      }
      if (opts.onFailure?.(result, vars)) return;
      if (opts.errorLabel) {
        useToastStore.getState().addToast(
          `${opts.errorLabel} failed: ${result.stderr || result.stdout || 'Unknown error'}`,
          'error',
        );
      }
    },
    onError: (err) => {
      if (!opts.errorLabel) return;
      useToastStore.getState().addToast(
        `${opts.errorLabel} failed: ${(err as Error).message}`,
        'error',
      );
    },
  });
}

// ── Working tree ────────────────────────────────────────────────────────────

export function useStage() {
  return useRepoMutation({
    mutationFn: (paths: string[]) => api.workingTree.stage(paths),
  });
}

export function useStageAll() {
  return useRepoMutation({
    mutationFn: () => api.workingTree.stageAll(),
  });
}

export function useUnstage() {
  return useRepoMutation({
    mutationFn: (paths: string[]) => api.workingTree.unstage(paths),
  });
}

export function useUnstageAll() {
  return useRepoMutation({
    mutationFn: () => api.workingTree.unstageAll(),
  });
}

export function useDiscard() {
  return useRepoMutation({
    mutationFn: ({ paths, untracked }: { paths: string[]; untracked?: boolean }) =>
      untracked ? api.workingTree.discardUntracked(paths) : api.workingTree.discard(paths),
  });
}

export function useDiscardAllUnstaged() {
  return useRepoMutation({
    mutationFn: () => api.workingTree.discardAllUnstaged(),
  });
}

// ── Commit ──────────────────────────────────────────────────────────────────

export function useCommit() {
  return useRepoMutation({
    mutationFn: (input: CommitInput) => api.commit.create(input as never),
    undo: (r) => (r.success && r.data?.sha
      ? { kind: 'commit', label: `Undo commit ${r.data.sha.slice(0, 7)}`, sha: r.data.sha }
      : null),
  });
}

// ── Branch ──────────────────────────────────────────────────────────────────

export function useCheckout() {
  return useRepoMutation({
    mutationFn: (input: CheckoutInput) => api.branch.checkout(input as never),
  });
}

export function useCreateBranch() {
  return useRepoMutation({
    mutationFn: (input: CreateBranchInput) => api.branch.create(input as never),
    undo: (r, vars) => (r.success
      ? { kind: 'branch-create', label: `Undo create branch ${vars.name}`, branch: vars.name }
      : null),
  });
}

export function useDeleteBranch() {
  return useRepoMutation({
    mutationFn: (input: DeleteBranchInput) => api.branch.delete(input as never),
    undo: (r, vars) => (r.success
      ? { kind: 'branch-delete', label: `Undo delete branch ${vars.name}`, branch: vars.name }
      : null),
  });
}

export function useCreateTag() {
  return useRepoMutation({
    mutationFn: (input: CreateTagInput) => api.tag.create(input as never),
  });
}

export function useDeleteTag() {
  return useRepoMutation({
    mutationFn: (input: { name: string }) => api.tag.delete(input as never),
  });
}

// ── Remote ──────────────────────────────────────────────────────────────────

export function useFetch() {
  return useRepoMutation({
    mutationFn: (input: FetchInput) => api.remote.fetch(input as never),
    errorLabel: 'Fetch',
    successToast: (r, vars) =>
      `Fetched remote '${vars.remote ?? 'origin'}'. ${r.data?.fetched ?? 0} refs updated.`,
  });
}

export function usePull() {
  return useRepoMutation({
    mutationFn: (input: PullInput) => api.remote.pull(input as never),
    errorLabel: 'Pull',
    successToast: (_r, vars) => `Successfully pulled from '${vars.remote ?? 'origin'}'`,
  });
}

export function usePush() {
  return useRepoMutation({
    mutationFn: (input: PushInput) => api.remote.push(input as never),
    errorLabel: 'Push',
    successToast: (_r, vars) => `Successfully pushed to '${vars.remote ?? 'origin'}'`,
    onFailure: (r, vars) => {
      if (!r.data?.rejected) return false;
      usePushBannerStore.getState().setRejection({
        ...r.data,
        message: r.stderr,
        remote: vars.remote,
        branch: vars.branch,
      });
      return true;
    },
  });
}

export function useFetchAll() {
  const qc = useQueryClient();
  return useRepoMutation({
    mutationFn: (prune?: boolean) => api.remote.fetchAll(prune),
    errorLabel: 'Fetch',
    successToast: (r) => `Fetched ${r.data?.fetched ?? 0} refs from all remotes`,
    onRefresh: () => {
      void qc.invalidateQueries({ queryKey: qk.status(activePath()) });
      void qc.invalidateQueries({ queryKey: qk.branches(activePath()) });
      void qc.invalidateQueries({ queryKey: qk.remotes(activePath()) });
      void qc.invalidateQueries({ queryKey: ['log'] });
    },
  });
}

// ── Stash ────────────────────────────────────────────────────────────────────

export function useStashList() {
  return useQuery({
    queryKey: ['stash'],
    queryFn: () => api.stash.list(),
    enabled: !!useRepoStore.getState().activeRepo,
    staleTime: 10_000,
    refetchOnWindowFocus: false,
  });
}

export function useStashCreate() {
  return useRepoMutation({
    mutationFn: (input: { message?: string; includeUntracked?: boolean; keepIndex?: boolean }) =>
      api.stash.create(input as never),
  });
}

export function useStashApply() {
  return useRepoMutation({
    mutationFn: (input: { ref?: string; keepIndex?: boolean }) =>
      api.stash.apply(input as never),
    undo: (r, vars) => (r.success
      ? { kind: 'stash-apply', label: `Undo stash apply ${vars.ref ?? 'stash@{0}'}` }
      : null),
  });
}

export function useStashPop() {
  return useRepoMutation({
    mutationFn: (input: { ref?: string; keepIndex?: boolean }) =>
      api.stash.pop(input as never),
    undo: (r, vars) => (r.success
      ? { kind: 'stash-pop', label: `Undo stash pop ${vars.ref ?? 'stash@{0}'}` }
      : null),
  });
}

export function useStashDrop() {
  return useRepoMutation({
    mutationFn: (input: { ref?: string }) =>
      api.stash.drop(input as never),
  });
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export function useReset() {
  return useRepoMutation({
    mutationFn: (input: { ref: string; mode: 'soft' | 'mixed' | 'hard' }) =>
      api.branch.reset(input.ref, input.mode),
  });
}

// ── Operations (merge/rebase/cherry-pick/revert + abort/continue/skip) ───────

export function useMerge() {
  return useRepoMutation({
    mutationFn: (input: { ref: string; noFf?: boolean; noCommit?: boolean; squash?: boolean }) =>
      api.operations.merge(input as never),
    undo: (r, vars) => (r.success
      ? { kind: 'merge', label: `Undo merge ${vars.ref}`, branch: vars.ref }
      : null),
  });
}

export function useRebase() {
  return useRepoMutation({
    mutationFn: (input: { onto: string; interactive?: boolean }) =>
      api.operations.rebase(input as never),
    undo: (r, vars) => (r.success
      ? { kind: 'rebase', label: `Undo rebase onto ${vars.onto}`, branch: vars.onto }
      : null),
  });
}

export function useCherryPick() {
  return useRepoMutation({
    mutationFn: (input: { shas: string[]; noCommit?: boolean }) =>
      api.operations.cherryPick(input as never),
    undo: (r, vars) => (r.success
      ? {
        kind: 'cherry-pick',
        label: `Undo cherry-pick ${vars.shas.map((s) => s.slice(0, 7)).join(', ')}`,
        sha: vars.shas[0],
      }
      : null),
  });
}

export function useRevert() {
  return useRepoMutation({
    mutationFn: (input: { shas: string[]; noCommit?: boolean }) =>
      api.operations.revert(input.shas, input.noCommit),
    undo: (r, vars) => (r.success
      ? {
        kind: 'revert',
        label: `Undo revert ${vars.shas.map((s) => s.slice(0, 7)).join(', ')}`,
        sha: vars.shas[0],
      }
      : null),
  });
}

export function useAbortOperation() {
  return useRepoMutation({
    mutationFn: (kind: import('@shared/git').OperationKind) =>
      api.operations.abort({ kind }),
  });
}

export function useContinueOperation() {
  return useRepoMutation({
    mutationFn: (kind: import('@shared/git').OperationKind) =>
      api.operations.continue({ kind }),
  });
}

export function useSkipOperation() {
  return useRepoMutation({
    mutationFn: (kind: import('@shared/git').OperationKind) =>
      api.operations.skip({ kind }),
  });
}

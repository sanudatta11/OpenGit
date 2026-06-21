// src/queries/useMutations.ts — TanStack Query mutation hooks for write operations.

import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { api } from '../ipc/api';
import { qk } from './keys';
import { useRepoStore } from '../stores/repo';
import { useToastStore } from '../stores/toast';
import { usePushBannerStore } from '../stores/pushBanner';
import { useUndoStore } from '../stores/undo';

function activePath(): string | null {
  return useRepoStore.getState().activeRepo?.path ?? null;
}

// Input types with optional defaults (renderer-side; main fills in defaults via Zod).
interface CommitInput { message: string; amend?: boolean; signoff?: boolean; noVerify?: boolean; author?: { name: string; email: string } }
interface CheckoutInput { ref: string; create?: boolean; force?: boolean }
interface CreateBranchInput { name: string; start?: string; checkout?: boolean }
interface DeleteBranchInput { name: string; force?: boolean }
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

// ── Working tree ────────────────────────────────────────────────────────────

export function useStage() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (paths: string[]) => api.workingTree.stage(paths),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

export function useStageAll() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: () => api.workingTree.stageAll(),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

export function useUnstage() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (paths: string[]) => api.workingTree.unstage(paths),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

export function useUnstageAll() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: () => api.workingTree.unstageAll(),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

export function useDiscard() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: ({ paths, untracked }: { paths: string[]; untracked?: boolean }) =>
      untracked ? api.workingTree.discardUntracked(paths) : api.workingTree.discard(paths),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

export function useDiscardAllUnstaged() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: () => api.workingTree.discardAllUnstaged(),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

// ── Commit ──────────────────────────────────────────────────────────────────

export function useCommit() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: CommitInput) => api.commit.create(input as never),
    onSuccess: (r) => {
      refresh(r.requiresRefresh);
      if (r.success && r.data?.sha) {
        useUndoStore.getState().setLastAction({
          kind: 'commit',
          label: `Undo commit ${r.data.sha.slice(0, 7)}`,
          sha: r.data.sha,
          ts: Date.now(),
        });
      }
    },
  });
}

// ── Branch ──────────────────────────────────────────────────────────────────

export function useCheckout() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: CheckoutInput) => api.branch.checkout(input as never),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

export function useCreateBranch() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: CreateBranchInput) => api.branch.create(input as never),
    onSuccess: (r, vars) => {
      refresh(r.requiresRefresh);
      if (r.success) {
        useUndoStore.getState().setLastAction({
          kind: 'branch-create',
          label: `Undo create branch ${vars.name}`,
          branch: vars.name,
          ts: Date.now(),
        });
      }
    },
  });
}

export function useDeleteBranch() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: DeleteBranchInput) => api.branch.delete(input as never),
    onSuccess: (r, vars) => {
      refresh(r.requiresRefresh);
      if (r.success) {
        useUndoStore.getState().setLastAction({
          kind: 'branch-delete',
          label: `Undo delete branch ${vars.name}`,
          branch: vars.name,
          ts: Date.now(),
        });
      }
    },
  });
}

// ── Remote ──────────────────────────────────────────────────────────────────

export function useFetch() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: FetchInput) => api.remote.fetch(input as never),
    onSuccess: (r, vars) => {
      refresh(r.requiresRefresh);
      if (r.success) {
        useToastStore.getState().addToast(`Fetched remote '${vars.remote ?? 'origin'}'. ${r.data?.fetched ?? 0} refs updated.`, 'success');
      } else {
        useToastStore.getState().addToast(`Fetch failed: ${r.stderr || r.stdout || 'Unknown error'}`, 'error');
      }
    },
    onError: (err) => {
      useToastStore.getState().addToast(`Fetch failed: ${(err as Error).message}`, 'error');
    },
  });
}

export function usePull() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: PullInput) => api.remote.pull(input as never),
    onSuccess: (r, vars) => {
      refresh(r.requiresRefresh);
      if (r.success) {
        useToastStore.getState().addToast(`Successfully pulled from '${vars.remote ?? 'origin'}'`, 'success');
      } else {
        useToastStore.getState().addToast(`Pull failed: ${r.stderr || r.stdout || 'Unknown error'}`, 'error');
      }
    },
    onError: (err) => {
      useToastStore.getState().addToast(`Pull failed: ${(err as Error).message}`, 'error');
    },
  });
}

export function usePush() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: PushInput) => api.remote.push(input as never),
    onSuccess: (r, vars) => {
      refresh(r.requiresRefresh);
      if (r.success) {
        useToastStore.getState().addToast(`Successfully pushed to '${vars.remote ?? 'origin'}'`, 'success');
      } else {
        if (r.data?.rejected) {
          usePushBannerStore.getState().setRejection({
            ...r.data,
            message: r.stderr,
            remote: vars.remote,
            branch: vars.branch,
          });
        } else {
          useToastStore.getState().addToast(`Push failed: ${r.stderr || r.stdout || 'Unknown error'}`, 'error');
        }
      }
    },
    onError: (err) => {
      useToastStore.getState().addToast(`Push failed: ${(err as Error).message}`, 'error');
    },
  });
}

export function useFetchAll() {
  const qc = useQueryClient();
  const toast = useToastStore.getState;
  return useMutation({
    mutationFn: (prune?: boolean) => api.remote.fetchAll(prune),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: qk.status(activePath()) });
      void qc.invalidateQueries({ queryKey: qk.branches(activePath()) });
      void qc.invalidateQueries({ queryKey: qk.remotes(activePath()) });
      void qc.invalidateQueries({ queryKey: ['log'] });
      if (r.data) {
        toast().addToast(`Fetched ${r.data.fetched} refs from all remotes`, 'success');
      }
    },
    onError: (err) => {
      toast().addToast(`Fetch failed: ${(err as Error).message}`, 'error');
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
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: { message?: string; includeUntracked?: boolean; keepIndex?: boolean }) =>
      api.stash.create(input as never),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

export function useStashApply() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: { ref?: string; keepIndex?: boolean }) =>
      api.stash.apply(input as never),
    onSuccess: (r, vars) => {
      refresh(r.requiresRefresh);
      if (r.success) {
        useUndoStore.getState().setLastAction({
          kind: 'stash-apply',
          label: `Undo stash apply ${vars.ref ?? 'stash@{0}'}`,
          ts: Date.now(),
        });
      }
    },
  });
}

export function useStashPop() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: { ref?: string; keepIndex?: boolean }) =>
      api.stash.pop(input as never),
    onSuccess: (r, vars) => {
      refresh(r.requiresRefresh);
      if (r.success) {
        useUndoStore.getState().setLastAction({
          kind: 'stash-pop',
          label: `Undo stash pop ${vars.ref ?? 'stash@{0}'}`,
          ts: Date.now(),
        });
      }
    },
  });
}

export function useStashDrop() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: { ref?: string }) =>
      api.stash.drop(input as never),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

// ── Reset ─────────────────────────────────────────────────────────────────────

export function useReset() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: { ref: string; mode: 'soft' | 'mixed' | 'hard' }) =>
      api.branch.reset(input.ref, input.mode),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

// ── Operations (merge/rebase/cherry-pick/revert + abort/continue/skip) ───────

export function useMerge() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: { ref: string; noFf?: boolean; noCommit?: boolean; squash?: boolean }) =>
      api.operations.merge(input as never),
    onSuccess: (r, vars) => {
      refresh(r.requiresRefresh);
      if (r.success) {
        useUndoStore.getState().setLastAction({
          kind: 'merge',
          label: `Undo merge ${vars.ref}`,
          branch: vars.ref,
          ts: Date.now(),
        });
      }
    },
  });
}

export function useRebase() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: { onto: string; interactive?: boolean }) =>
      api.operations.rebase(input as never),
    onSuccess: (r, vars) => {
      refresh(r.requiresRefresh);
      if (r.success) {
        useUndoStore.getState().setLastAction({
          kind: 'rebase',
          label: `Undo rebase onto ${vars.onto}`,
          branch: vars.onto,
          ts: Date.now(),
        });
      }
    },
  });
}

export function useCherryPick() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: { shas: string[]; noCommit?: boolean }) =>
      api.operations.cherryPick(input as never),
    onSuccess: (r, vars) => {
      refresh(r.requiresRefresh);
      if (r.success) {
        useUndoStore.getState().setLastAction({
          kind: 'cherry-pick',
          label: `Undo cherry-pick ${vars.shas.map((s) => s.slice(0, 7)).join(', ')}`,
          sha: vars.shas[0],
          ts: Date.now(),
        });
      }
    },
  });
}

export function useRevert() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (input: { shas: string[]; noCommit?: boolean }) =>
      api.operations.revert(input.shas, input.noCommit),
    onSuccess: (r, vars) => {
      refresh(r.requiresRefresh);
      if (r.success) {
        useUndoStore.getState().setLastAction({
          kind: 'revert',
          label: `Undo revert ${vars.shas.map((s) => s.slice(0, 7)).join(', ')}`,
          sha: vars.shas[0],
          ts: Date.now(),
        });
      }
    },
  });
}

export function useAbortOperation() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (kind: import('@shared/git').OperationKind) =>
      api.operations.abort({ kind }),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

export function useContinueOperation() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (kind: import('@shared/git').OperationKind) =>
      api.operations.continue({ kind }),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

export function useSkipOperation() {
  const refresh = useRefreshOnSuccess();
  return useMutation({
    mutationFn: (kind: import('@shared/git').OperationKind) =>
      api.operations.skip({ kind }),
    onSuccess: (r) => refresh(r.requiresRefresh),
  });
}

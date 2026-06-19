// src/components/InProgressBanner.tsx — banner shown when a git operation is in progress.
// Offers abort/continue/skip based on the operation kind.

import { AlertTriangle, X, Play, SkipForward, Loader2, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useAbortOperation, useContinueOperation, useSkipOperation } from '../queries/useMutations';
import { useRepoStore } from '../stores/repo';
import { ConfirmDialog } from './ConfirmDialog';
import type { InProgressState, OperationKind } from '@shared/git';

export function InProgressBanner({ states }: { states: readonly InProgressState[] }) {
  const [confirmAbort, setConfirmAbort] = useState<OperationKind | null>(null);
  const abort = useAbortOperation();

  if (states.length === 0) return null;

  return (
    <>
      {states.map((s) => (
        <BannerRow key={s.kind} state={s} onAbort={() => setConfirmAbort(s.kind)} />
      ))}
      <ConfirmDialog
        open={!!confirmAbort}
        title="Abort operation?"
        message={`Abort the ${confirmAbort} operation? This rolls back to the state before it started.`}
        confirmLabel="Abort"
        danger
        onConfirm={() => {
          if (confirmAbort) void abort.mutate(confirmAbort);
          setConfirmAbort(null);
        }}
        onCancel={() => setConfirmAbort(null)}
      />
    </>
  );
}

function BannerRow({ state, onAbort }: { state: InProgressState; onAbort: () => void }) {
  const abort = useAbortOperation();
  const cont = useContinueOperation();
  const skip = useSkipOperation();

  const kindLabel = labelFor(state.kind);
  const stepLabel =
    state.currentStep != null && state.totalSteps != null
      ? `Step ${state.currentStep} of ${state.totalSteps}`
      : null;
  const conflictCount = state.conflictingPaths.length;

  const handleContinue = () => void cont.mutate(state.kind);
  const handleSkip = () => void skip.mutate(state.kind);
  const handleAbort = () => onAbort();

  return (
    <div className="border-b border-git-conflicted/40 bg-git-conflicted/10 px-3 py-2 flex items-center gap-2 shrink-0">
      <AlertTriangle className="w-4 h-4 text-git-conflicted shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-git-conflicted">
          {kindLabel} in progress
          {stepLabel && <span className="text-fg-muted font-normal ml-2">· {stepLabel}</span>}
        </div>
        {conflictCount > 0 && (
          <>
            <div className="text-xs text-fg-muted mt-0.5">
              {conflictCount} conflict{conflictCount === 1 ? '' : 's'} to resolve
            </div>
            <button
              className="text-xs text-accent hover:underline mt-1 inline-flex items-center gap-0.5"
              onClick={() => useRepoStore.getState().setSidebarTab('actions')}
            >
              Resolve conflicts
              <ExternalLink className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {state.canSkip && (
          <button
            className="btn !text-xxs !px-2 !py-0.5"
            onClick={handleSkip}
            disabled={skip.isPending}
            title="Skip this commit"
          >
            {skip.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <SkipForward className="w-3 h-3" />}
            Skip
          </button>
        )}
        {state.canContinue && (
          <button
            className="btn btn-primary !text-xxs !px-2 !py-0.5"
            onClick={handleContinue}
            disabled={cont.isPending}
            title="Continue after resolving conflicts"
          >
            {cont.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
            Continue
          </button>
        )}
        {state.canAbort && (
          <button
            className="btn btn-danger !text-xxs !px-2 !py-0.5"
            onClick={handleAbort}
            disabled={abort.isPending}
            title="Abort the operation"
          >
            {abort.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            Abort
          </button>
        )}
      </div>
    </div>
  );
}

function labelFor(kind: OperationKind): string {
  switch (kind) {
    case 'merge': return 'Merge';
    case 'rebase': return 'Rebase';
    case 'cherry-pick': return 'Cherry-pick';
    case 'revert': return 'Revert';
    case 'bisect': return 'Bisect';
  }
}

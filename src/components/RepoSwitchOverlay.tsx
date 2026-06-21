// src/components/RepoSwitchOverlay.tsx — translucent overlay shown during repo switch.

import { useEffect, useRef } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useRepoStore } from '../stores/repo';
import { Loader2 } from 'lucide-react';
import { qk } from '../queries/keys';

export function RepoSwitchOverlay() {
  const isSwitching = useRepoStore((s) => s.isSwitchingRepo);
  const repoSwitchTargetPath = useRepoStore((s) => s.repoSwitchTargetPath);
  const repoSwitchPhase = useRepoStore((s) => s.repoSwitchPhase);
  const completeRepoSwitch = useRepoStore((s) => s.completeRepoSwitch);
  const failRepoSwitch = useRepoStore((s) => s.failRepoSwitch);
  const qc = useQueryClient();
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchingCore = useIsFetching({
    predicate: (query) => {
      if (!repoSwitchTargetPath) return false;
      return Array.isArray(query.queryKey) && query.queryKey.includes(repoSwitchTargetPath);
    },
  });

  useEffect(() => {
    if (!isSwitching || !repoSwitchTargetPath) return;

    if (!safetyRef.current) {
      safetyRef.current = setTimeout(() => {
        failRepoSwitch();
        safetyRef.current = null;
      }, 6_000);
    }

    if (repoSwitchPhase !== 'settling') return;

    const queriesReady = fetchingCore === 0 && [
      qk.status(repoSwitchTargetPath),
      qk.branches(repoSwitchTargetPath),
      qk.state(repoSwitchTargetPath),
      qk.remotes(repoSwitchTargetPath),
      qk.log(undefined, 0, 200, undefined, repoSwitchTargetPath),
    ].every((queryKey) => {
      const state = qc.getQueryState(queryKey);
      return state?.status === 'success' || state?.status === 'error';
    });

    if (queriesReady) {
      completeRepoSwitch();
    }

    return () => {
      if (safetyRef.current) {
        clearTimeout(safetyRef.current);
        safetyRef.current = null;
      }
    };
  }, [completeRepoSwitch, failRepoSwitch, fetchingCore, isSwitching, qc, repoSwitchPhase, repoSwitchTargetPath]);

  if (!isSwitching) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading repository"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-[2px]"
    >
      <div className="flex flex-col items-center gap-3 px-6 py-5 rounded-lg bg-bg-panel border border-border shadow-xl">
        <Loader2 className="w-7 h-7 text-accent animate-spin" />
        <div className="text-sm text-fg font-medium">Loading Repository</div>
        <div className="text-xs text-fg-muted">Preparing commits &amp; status…</div>
      </div>
    </div>
  );
}

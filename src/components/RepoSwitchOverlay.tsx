// src/components/RepoSwitchOverlay.tsx — translucent overlay shown during repo switch.

import { useEffect, useRef } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useRepoStore } from '../stores/repo';
import { Loader2 } from 'lucide-react';

export function RepoSwitchOverlay() {
  const isSwitching = useRepoStore((s) => s.isSwitchingRepo);
  const setSwitchingRepo = useRepoStore((s) => s.setSwitchingRepo);
  const fetching = useIsFetching();
  const qc = useQueryClient();
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear flag when mutation settled + all queries idle.
  useEffect(() => {
    if (!isSwitching) return;

    // 6s safety timeout — force-clear if a query hangs.
    if (!safetyRef.current) {
      safetyRef.current = setTimeout(() => {
        setSwitchingRepo(false);
        safetyRef.current = null;
      }, 6_000);
    }

    if (fetching === 0) {
      // rAF guard: skip the one-frame gap between removeQueries() and new queries mounting.
      const id = requestAnimationFrame(() => {
        if (qc.isFetching() === 0) {
          setSwitchingRepo(false);
        }
      });
      return () => {
        cancelAnimationFrame(id);
        if (safetyRef.current) {
          clearTimeout(safetyRef.current);
          safetyRef.current = null;
        }
      };
    }

    return () => {
      if (safetyRef.current) {
        clearTimeout(safetyRef.current);
        safetyRef.current = null;
      }
    };
  }, [isSwitching, fetching, qc, setSwitchingRepo]);

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

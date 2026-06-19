// src/components/header/Toolbar.tsx — action row: branch selector, remote ops,
// repo name, refresh, terminal, undo, settings.

import { ArrowUp, ArrowDown, Cloud, Loader2, RefreshCw, Terminal, Settings, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { useRepoStore, repoName } from '../../stores/repo';
import { useBranches, useRemotes } from '../../queries/useRepo';
import { useFetch, usePull, usePush, useFetchAll } from '../../queries/useMutations';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { useUndoStore } from '../../stores/undo';
import { useToastStore } from '../../stores/toast';
import { api } from '../../ipc/api';
import { BranchSelector } from './BranchSelector';

export function Toolbar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const repo = useRepoStore((s) => s.activeRepo)!;
  const toggleLogDrawer = useRepoStore((s) => s.toggleLogDrawer);
  const logDrawerOpen = useRepoStore((s) => s.logDrawerOpen);
  const branches = useBranches();
  const remotes = useRemotes();
  const fetch_ = useFetch();
  const pull = usePull();
  const push = usePush();
  const fetchAll = useFetchAll();
  const qc = useQueryClient();

  const hasRemote = (remotes.data?.length ?? 0) > 0;
  const defaultRemote = useMemo(() => remotes.data?.[0]?.name ?? 'origin', [remotes.data]);
  const currentBranch = branches.data?.find((b) => b.isHead);
  const upstreamRemote = useMemo(() => {
    if (!currentBranch?.upstream) return null;
    const parts = currentBranch.upstream.split('/');
    if (parts.length >= 2) return parts[0];
    return null;
  }, [currentBranch]);
  const upstreamBranch = useMemo(() => {
    if (!currentBranch?.upstream) return null;
    const parts = currentBranch.upstream.split('/');
    if (parts.length >= 2) return parts.slice(1).join('/');
    return null;
  }, [currentBranch]);
  const remoteForOps = upstreamRemote || defaultRemote;
  const branchForPush = upstreamBranch || (currentBranch?.shortName ?? '');

  const hasUpstream = !!(currentBranch?.upstream);
  const refresh = () => {
    if (hasRemote) {
      fetchAll.mutate(false);
    } else {
      void qc.invalidateQueries();
    }
  };

  const shortName = repoName(repo);
  const busy = fetch_.isPending || pull.isPending || push.isPending || fetchAll.isPending;

  const undoStore = useUndoStore();
  const undo = useMutation({
    mutationFn: () => {
      if (!undoStore.lastAction) throw new Error('No action to undo');
      return api.operations.undo({
        kind: undoStore.lastAction.kind,
        branch: undoStore.lastAction.branch,
        sha: undoStore.lastAction.sha,
      });
    },
    onSuccess: () => {
      useUndoStore.getState().setLastAction(null);
      useToastStore.getState().addToast('Undo successful', 'success');
      void qc.invalidateQueries();
    },
    onError: (err) => {
      useToastStore.getState().addToast(`Undo failed: ${(err as Error).message}`, 'error');
    },
  });

  const handleUndo = () => {
    if (undoStore.lastAction && !undo.isPending) {
      undo.mutate();
    }
  };

  return (
    <div className="h-8 flex items-center px-3 gap-3 border-b border-border bg-bg-panel shrink-0">
      <BranchSelector />

      <div className="flex items-center gap-2 min-w-0">
        <span className="text-fg-dim text-xs truncate hidden md:inline">{shortName}</span>
      </div>

      <div className="flex-1" />

      {hasRemote && (
        <div className="flex items-center gap-0.5">
          <button
            className="icon-btn"
            onClick={() => fetch_.mutate({ remote: remoteForOps, prune: true })}
            disabled={busy}
            title={`Fetch (${remoteForOps})`}
          >
            {fetch_.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
          </button>
          <button
            className="icon-btn"
            onClick={() => pull.mutate({ remote: remoteForOps, ffOnly: false })}
            disabled={busy}
            title="Pull"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            className="icon-btn"
            onClick={() => push.mutate({ remote: remoteForOps, branch: branchForPush, forceWithLease: false, setUpstream: !hasUpstream })}
            disabled={busy}
            title="Push"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      )}

      {undoStore.lastAction !== null && (
        <button
          className="icon-btn text-git-modified"
          onClick={handleUndo}
          disabled={undo.isPending}
          title={undoStore.lastAction.label}
        >
          {undo.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
        </button>
      )}
      <button className="icon-btn" onClick={refresh} title="Refresh (F5)">
        {fetchAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      </button>
      <button
        className={`icon-btn ${logDrawerOpen ? 'text-accent' : ''}`}
        onClick={() => toggleLogDrawer()}
        title="Toggle terminal (Ctrl/Cmd+L)"
      >
        <Terminal className="w-4 h-4" />
      </button>
      <button className="icon-btn" onClick={onOpenSettings} title="Settings (Ctrl/Cmd+,)">
        <Settings className="w-4 h-4" />
      </button>
    </div>
  );
}

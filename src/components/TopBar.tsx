// src/components/TopBar.tsx — top toolbar: repo name, branch, ahead/behind, fetch/pull/push, actions.

import { GitBranch, ArrowUp, ArrowDown, CircleDot, Terminal, RefreshCw, FolderOpen, Cloud, Loader2, Settings } from 'lucide-react';
import { useRepoStore } from '../stores/repo';
import { useStatus, useRemotes } from '../queries/useRepo';
import { useOpenRepo } from '../queries/useRepo';
import { useFetch, usePull, usePush } from '../queries/useMutations';
import { useQueryClient } from '@tanstack/react-query';

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const repo = useRepoStore((s) => s.repo)!;
  const toggleLogDrawer = useRepoStore((s) => s.toggleLogDrawer);
  const logDrawerOpen = useRepoStore((s) => s.logDrawerOpen);
  const status = useStatus();
  const remotes = useRemotes();
  const openRepo = useOpenRepo();
  const fetch_ = useFetch();
  const pull = usePull();
  const push = usePush();
  const qc = useQueryClient();

  const hasRemote = (remotes.data?.length ?? 0) > 0;
  const refresh = () => { void qc.invalidateQueries(); };

  const handleOpen = async () => {
    const path = await window.api.dialog.pickRepo();
    if (path) await openRepo.mutateAsync(path);
  };

  const ahead = status.data?.ahead ?? 0;
  const behind = status.data?.behind ?? 0;
  const dirty = !status.data?.isClean;
  const branch = repo.currentBranch ?? (repo.isDetached ? `detached at ${repo.headSha?.slice(0, 7)}` : 'HEAD');
  const repoName = repo.path.split('/').pop() ?? repo.path;
  const busy = fetch_.isPending || pull.isPending || push.isPending;

  return (
    <div className="h-10 flex items-center px-3 gap-3 border-b border-border bg-bg-panel shrink-0">
      <button className="icon-btn" onClick={handleOpen} title="Open repository">
        <FolderOpen className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-2 min-w-0">
        <span className="text-fg font-semibold text-sm truncate">{repoName}</span>
        <span className="text-fg-dim text-xs truncate hidden md:inline">{repo.path}</span>
      </div>

      <div className="flex-1" />

      {hasRemote && (
        <div className="flex items-center gap-0.5">
          <button
            className="icon-btn"
            onClick={() => fetch_.mutate({ remote: 'origin', prune: true })}
            disabled={busy}
            title="Fetch (with prune)"
          >
            {fetch_.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
          </button>
          <button
            className="icon-btn"
            onClick={() => pull.mutate({ remote: 'origin', ffOnly: false })}
            disabled={busy}
            title="Pull"
          >
            <ArrowDown className="w-4 h-4" />
          </button>
          <button
            className="icon-btn"
            onClick={() => push.mutate({ remote: 'origin', forceWithLease: false, setUpstream: false })}
            disabled={busy}
            title="Push"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-elevated border border-border text-xs">
        <GitBranch className="w-3.5 h-3.5 text-git-branch" />
        <span className="text-fg font-medium">{branch}</span>
        {(ahead > 0 || behind > 0) && (
          <span className="flex items-center gap-1 ml-1 text-fg-muted">
            {ahead > 0 && (
              <span className="flex items-center gap-0.5 text-git-added">
                <ArrowUp className="w-3 h-3" />
                {ahead}
              </span>
            )}
            {behind > 0 && (
              <span className="flex items-center gap-0.5 text-git-remote">
                <ArrowDown className="w-3 h-3" />
                {behind}
              </span>
            )}
          </span>
        )}
        {dirty && (
          <span className="flex items-center gap-0.5 ml-1 text-git-modified" title="Working tree has changes">
            <CircleDot className="w-3 h-3" />
          </span>
        )}
      </div>

      <button className="icon-btn" onClick={refresh} title="Refresh (F5)">
        <RefreshCw className="w-4 h-4" />
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

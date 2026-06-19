// src/components/TopBar.tsx — top toolbar: repo name, branch, ahead/behind, fetch/pull/push, actions.

import { GitBranch, ArrowUp, ArrowDown, CircleDot, Terminal, RefreshCw, FolderOpen, Cloud, Loader2, Settings, Search, ChevronDown } from 'lucide-react';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useRepoStore } from '../stores/repo';
import { useStatus, useBranches, useRemotes } from '../queries/useRepo';
import { useOpenRepo } from '../queries/useRepo';
import { useFetch, usePull, usePush, useCheckout, useFetchAll } from '../queries/useMutations';
import { useQueryClient } from '@tanstack/react-query';
import type { Branch } from '@shared/git';

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  const repo = useRepoStore((s) => s.repo)!;
  const toggleLogDrawer = useRepoStore((s) => s.toggleLogDrawer);
  const logDrawerOpen = useRepoStore((s) => s.logDrawerOpen);
  const branches = useBranches();
  const remotes = useRemotes();
  const openRepo = useOpenRepo();
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

  const handleOpen = async () => {
    const path = await window.api.dialog.pickRepo();
    if (path) await openRepo.mutateAsync(path);
  };

  const repoName = repo.path.split('/').pop() ?? repo.path;
  const busy = fetch_.isPending || pull.isPending || push.isPending || fetchAll.isPending;

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

      <BranchSelector />

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

function BranchSelector() {
  const repo = useRepoStore((s) => s.repo)!;
  const branches = useBranches();
  const status = useStatus();
  const checkout = useCheckout();

  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const ahead = status.data?.ahead ?? 0;
  const behind = status.data?.behind ?? 0;
  const dirty = !status.data?.isClean;
  const branch = repo.currentBranch ?? (repo.isDetached ? `detached at ${repo.headSha?.slice(0, 7)}` : 'HEAD');

  const localBranches = useMemo(
    () =>
      (branches.data ?? [])
        .filter((b) => b.kind === 'local')
        .filter((b) => !filter || b.shortName.toLowerCase().includes(filter.toLowerCase())),
    [branches.data, filter],
  );

  const remoteBranches = useMemo(
    () =>
      (branches.data ?? [])
        .filter((b) => b.kind === 'remote')
        .filter((b) => !filter || b.shortName.toLowerCase().includes(filter.toLowerCase())),
    [branches.data, filter],
  );

  const filteredBranches = useMemo(
    () => [...localBranches, ...remoteBranches],
    [localBranches, remoteBranches],
  );

  useEffect(() => {
    setFocusedIndex(0);
  }, [filter]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setFilter('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (b: Branch) => {
    if (b.kind === 'remote') {
      checkout.mutate({ ref: b.name, create: true });
    } else {
      checkout.mutate({ ref: b.shortName });
    }
    setOpen(false);
    setFilter('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setFilter('');
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, filteredBranches.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter' && filteredBranches[focusedIndex]) {
      e.preventDefault();
      handleSelect(filteredBranches[focusedIndex]);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-elevated border border-border text-xs hover:bg-bg-hover transition-colors"
        onClick={() => setOpen(!open)}
      >
        <GitBranch className="w-3.5 h-3.5 text-git-branch" />
        <span className="text-fg font-medium truncate max-w-[160px]">{branch}</span>
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
        <ChevronDown className={`w-3 h-3 text-fg-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 max-h-80 rounded-lg border border-border bg-bg-panel shadow-2xl z-50 overflow-hidden">
          <div className="h-8 flex items-center gap-2 px-2 border-b border-border">
            <Search className="w-3.5 h-3.5 text-fg-muted shrink-0" />
            <input
              className="flex-1 bg-transparent outline-none text-xs text-fg"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder="Filter branches..."
            />
          </div>
          <div className="py-1 max-h-64 overflow-y-auto">
            {filteredBranches.length === 0 && (
              <div className="px-3 py-4 text-xs text-fg-muted text-center">No branches found</div>
            )}
            {localBranches.length > 0 && (
              <>
                <div className="px-2 py-1 text-xxs text-fg-muted uppercase tracking-wider">Local</div>
                {localBranches.map((b) => {
                  const allIdx = filteredBranches.indexOf(b);
                  return (
                    <button
                      key={b.name}
                      className={`w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-bg-hover ${allIdx === focusedIndex ? 'bg-bg-hover' : ''} ${b.isHead ? 'text-accent' : 'text-fg'}`}
                      onClick={() => handleSelect(b)}
                      onMouseEnter={() => setFocusedIndex(allIdx)}
                    >
                      <GitBranch className="w-3.5 h-3.5 text-git-branch shrink-0" />
                      <span className="flex-1 text-xs truncate">{b.shortName}</span>
                      {b.upstreamTrack && (
                        <span className="flex items-center gap-1 text-xxs shrink-0">
                          {b.upstreamTrack.ahead > 0 && (
                            <span className="text-git-added flex items-center gap-0.5">
                              <ArrowUp className="w-2.5 h-2.5" />
                              {b.upstreamTrack.ahead}
                            </span>
                          )}
                          {b.upstreamTrack.behind > 0 && (
                            <span className="text-git-remote flex items-center gap-0.5">
                              <ArrowDown className="w-2.5 h-2.5" />
                              {b.upstreamTrack.behind}
                            </span>
                          )}
                        </span>
                      )}
                    </button>
                  );
                })}
              </>
            )}
            {remoteBranches.length > 0 && (
              <>
                <div className="px-2 py-1 text-xxs text-fg-muted uppercase tracking-wider">Remote</div>
                {remoteBranches.map((b) => {
                  const allIdx = filteredBranches.indexOf(b);
                  const remoteName = b.name.split('/')[0] ?? '';
                  return (
                    <button
                      key={b.name}
                      className={`w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-bg-hover ${allIdx === focusedIndex ? 'bg-bg-hover' : ''} text-fg`}
                      onClick={() => handleSelect(b)}
                      onMouseEnter={() => setFocusedIndex(allIdx)}
                    >
                      <Cloud className="w-3.5 h-3.5 text-git-remote shrink-0" />
                      <span className="flex-1 text-xs truncate">{b.shortName}</span>
                      <span className="text-xxs text-fg-dim shrink-0">{remoteName}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// src/components/header/BranchSelector.tsx — branch dropdown with
// filter, keyboard navigation, ahead/behind indicator, and dirty-state dot.

import { GitBranch, ArrowUp, ArrowDown, CircleDot, Search, ChevronDown, Cloud } from 'lucide-react';
import { useMemo, useState, useEffect, useRef } from 'react';
import { useRepoStore } from '../../stores/repo';
import { useBranches, useStatus } from '../../queries/useRepo';
import { useCheckout } from '../../queries/useMutations';
import type { Branch } from '@shared/git';

export function BranchSelector() {
  const repo = useRepoStore((s) => s.activeRepo)!;
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

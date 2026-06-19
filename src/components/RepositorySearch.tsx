// src/components/RepositorySearch.tsx — Ctrl+P repository search popup.

import { useEffect, useState } from 'react';
import { Search, X, GitBranch, GitCommit, FileText, Tag, Archive, Folder } from 'lucide-react';
import { api } from '../ipc/api';
import { useRepoStore } from '../stores/repo';
import { useCheckout } from '../queries/useMutations';
import type { RepoSearchResult, RepoSearchResultKind } from '@shared/ipc';

interface RepositorySearchProps {
  open: boolean;
  onClose: () => void;
}

export function RepositorySearch({ open, onClose }: RepositorySearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RepoSearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPending, setIsPending] = useState(false);

  const checkout = useCheckout();
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const setSidebarTab = useRepoStore((s) => s.setSidebarTab);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setSelectedIndex(0);
      search('');
    }
  }, [open]);

  const search = async (q: string) => {
    setIsPending(true);
    try {
      const res = await api.repo.search({ query: q, limit: 10 });
      setResults(res);
      setSelectedIndex(0);
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setIsPending(false);
    }
  };

  const handleInputChange = (val: string) => {
    setQuery(val);
    search(val);
  };

  const executeSelection = (item: RepoSearchResult) => {
    if (item.kind === 'branch' || item.kind === 'tag') {
      if (item.ref) void checkout.mutate({ ref: item.ref });
    } else if (item.kind === 'commit') {
      if (item.sha) {
        selectCommit(item.sha);
      }
    } else if (item.kind === 'file') {
    } else if (item.kind === 'stash') {
      setSidebarTab('stash');
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[selectedIndex]) {
        executeSelection(results[selectedIndex]!);
      }
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[12vh]" onMouseDown={onClose}>
      <div className="w-[620px] max-w-[calc(100vw-32px)] rounded-lg border border-border bg-bg-panel shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="h-11 flex items-center gap-2 px-3 border-b border-border">
          <Search className="w-4 h-4 text-fg-muted" />
          <input
            className="flex-1 bg-transparent outline-none text-sm text-fg"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            placeholder="Search branches, commits, files, tags..."
          />
          {isPending && <span className="text-xxs text-fg-dim animate-pulse">Searching...</span>}
          <button className="icon-btn" onClick={onClose} title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="py-1 max-h-[360px] overflow-y-auto">
          {results.length > 0 ? (
            results.map((item, index) => {
              const Icon = iconForKind(item.kind);
              const active = index === selectedIndex;
              return (
                <button
                  key={`${item.kind}:${item.label}:${index}`}
                  className={`w-full px-3 py-2 flex items-center gap-3 text-left transition-colors ${active ? 'bg-accent/10' : 'hover:bg-bg-hover'}`}
                  onClick={() => executeSelection(item)}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${colorForKind(item.kind)}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-fg truncate font-medium">{item.label}</span>
                    <span className="block text-xxs text-fg-muted truncate">{item.detail}</span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-4 text-center text-xs text-fg-dim">
              No results match your query.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function iconForKind(kind: RepoSearchResultKind) {
  switch (kind) {
    case 'branch': return GitBranch;
    case 'tag': return Tag;
    case 'commit': return GitCommit;
    case 'file': return FileText;
    case 'stash': return Archive;
    case 'repository': return Folder;
    default: return Search;
  }
}

function colorForKind(kind: RepoSearchResultKind): string {
  switch (kind) {
    case 'branch': return 'text-git-branch';
    case 'tag': return 'text-git-tag';
    case 'commit': return 'text-accent';
    case 'file': return 'text-fg-muted';
    case 'stash': return 'text-git-stash';
    case 'repository': return 'text-git-head';
    default: return 'text-fg-dim';
  }
}

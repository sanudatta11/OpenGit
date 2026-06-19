// src/components/sidebar/LFSTab.tsx — Git LFS tracked patterns.

import { useState } from 'react';
import { Database, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import { useRepoStore } from '../../stores/repo';
import { ConfirmDialog } from '../ConfirmDialog';

export function LFSTab() {
  const repo = useRepoStore((s) => s.activeRepo);
  const [pattern, setPattern] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [confirmUntrack, setConfirmUntrack] = useState<string | null>(null);
  const [, setUntrackLoading] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['lfs'],
    queryFn: () => api.lfs.list(),
    enabled: !!repo,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const handleTrack = async () => {
    if (!pattern.trim()) return;
    setTrackLoading(true);
    try {
      await api.lfs.track(pattern.trim());
      setPattern('');
      await refetch();
    } finally {
      setTrackLoading(false);
    }
  };

  const handleUntrack = async () => {
    if (!confirmUntrack) return;
    setUntrackLoading(true);
    try {
      await api.lfs.untrack(confirmUntrack);
      setConfirmUntrack(null);
      await refetch();
    } finally {
      setUntrackLoading(false);
    }
  };

  if (isLoading) return <div className="p-3 text-fg-muted text-xs">Loading…</div>;
  if (error) return <div className="p-3 text-git-deleted text-xs">{(error as Error).message}</div>;

  const patterns = data ?? [];

  return (
    <div className="py-1 text-xs">
      <div className="px-3 py-1 label flex items-center justify-between">
        <span>LFS Patterns</span>
        <button className="icon-btn !w-5 !h-5" onClick={() => refetch()} title="Refresh">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-border-subtle space-y-2">
        <div className="flex items-center gap-1">
          <input
            className="input w-full"
            placeholder="Pattern (e.g. *.psd)"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleTrack(); }}
          />
          <button
            className="btn btn-primary !text-xxs !px-2 !py-0.5 shrink-0"
            onClick={handleTrack}
            disabled={trackLoading || !pattern.trim()}
          >
            {trackLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Track'}
          </button>
        </div>
      </div>

      {patterns.length === 0 && (
        <div className="px-3 py-2 text-fg-dim">No LFS patterns tracked.</div>
      )}

      {patterns.map((p) => (
        <div key={p} className="px-3 py-1.5 border-b border-border-subtle/30 flex items-center gap-2">
          <Database className="w-3.5 h-3.5 shrink-0 text-fg-muted" />
          <span className="font-mono text-fg truncate flex-1">{p}</span>
          <button
            className="icon-btn !w-5 !h-5 hover:text-git-deleted shrink-0"
            onClick={() => setConfirmUntrack(p)}
            title={`Untrack ${p}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}

      <ConfirmDialog
        open={!!confirmUntrack}
        title="Untrack LFS pattern?"
        message={`Stop tracking "${confirmUntrack}" with Git LFS? This only modifies .gitattributes.`}
        confirmLabel="Untrack"
        danger
        onConfirm={handleUntrack}
        onCancel={() => setConfirmUntrack(null)}
      />
    </div>
  );
}

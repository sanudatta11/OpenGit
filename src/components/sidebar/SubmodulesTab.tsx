// src/components/sidebar/SubmodulesTab.tsx — list/init/deinit submodules.

import { useState } from 'react';
import { FolderGit, Loader2, RefreshCw, Trash2, CircleDot } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import { useRepoStore } from '../../stores/repo';
import { ConfirmDialog } from '../ConfirmDialog';

export function SubmodulesTab() {
  const qc = useQueryClient();
  const repo = useRepoStore((s) => s.repo);
  const [initLoading, setInitLoading] = useState(false);
  const [confirmDeinit, setConfirmDeinit] = useState<string | null>(null);
  const [deinitForce, setDeinitForce] = useState(false);
  const [, setDeinitLoading] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['submodules'],
    queryFn: () => api.submodule.list(),
    enabled: !!repo,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });

  const handleInitAll = async () => {
    setInitLoading(true);
    try {
      await api.submodule.init(true);
      await refetch();
      void qc.invalidateQueries({ queryKey: ['status'] });
    } finally {
      setInitLoading(false);
    }
  };

  const handleDeinit = async () => {
    if (!confirmDeinit) return;
    setDeinitLoading(true);
    try {
      await api.submodule.deinit(confirmDeinit, deinitForce);
      setConfirmDeinit(null);
      setDeinitForce(false);
      await refetch();
    } finally {
      setDeinitLoading(false);
    }
  };

  if (isLoading) return <div className="p-3 text-fg-muted text-xs">Loading…</div>;
  if (error) return <div className="p-3 text-git-deleted text-xs">{(error as Error).message}</div>;

  const subs = data ?? [];
  const dirty = (_s: { sha: string }) => false;

  return (
    <div className="py-1 text-xs">
      <div className="px-3 py-1 label flex items-center justify-between">
        <span>Submodules</span>
        <div className="flex items-center gap-1">
          <button className="icon-btn !w-5 !h-5" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="w-3 h-3" />
          </button>
          {subs.length > 0 && (
            <button
              className="btn !text-xxs !px-2 !py-0.5"
              onClick={handleInitAll}
              disabled={initLoading}
            >
              {initLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Init All'}
            </button>
          )}
        </div>
      </div>

      {subs.length === 0 && (
        <div className="px-3 py-2 text-fg-dim">No submodules found.</div>
      )}

      {subs.map((s) => (
        <div key={s.path} className="px-3 py-1.5 border-b border-border-subtle/30">
          <div className="flex items-center gap-2">
            <FolderGit className="w-3.5 h-3.5 shrink-0 text-fg-muted" />
            <span className="text-fg truncate flex-1" title={s.path}>{s.path}</span>
            <span className="text-xxs font-mono text-fg-dim">{s.sha.slice(0, 7)}</span>
          </div>
          {s.branch && (
            <div className="mt-0.5 text-xxs text-fg-dim ml-5.5">
              branch: {s.branch}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1 ml-5.5">
            <CircleDot className={`w-2.5 h-2.5 shrink-0 ${dirty(s) ? 'text-git-modified' : 'text-git-added'}`} />
            <span className="text-xxs text-fg-dim">{dirty(s) ? 'dirty' : 'clean'}</span>
            <button
              className="icon-btn !w-5 !h-5 hover:text-git-deleted ml-auto"
              onClick={() => setConfirmDeinit(s.path)}
              title="Deinit submodule"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={!!confirmDeinit}
        title="Deinit submodule?"
        message={`Deinit "${confirmDeinit}"? This removes the submodule from the working tree.`}
        confirmLabel="Deinit"
        danger
        onConfirm={handleDeinit}
        onCancel={() => { setConfirmDeinit(null); setDeinitForce(false); }}
      >
        <label className="flex items-center gap-1.5 mt-2 text-xxs text-fg-muted cursor-pointer">
          <input
            type="checkbox"
            checked={deinitForce}
            onChange={(e) => setDeinitForce(e.target.checked)}
            className="accent-accent"
          />
          Force (remove even if dirty)
        </label>
      </ConfirmDialog>
    </div>
  );
}

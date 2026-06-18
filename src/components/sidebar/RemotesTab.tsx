// src/components/sidebar/RemotesTab.tsx — list remotes.

import { Cloud } from 'lucide-react';
import { useRemotes } from '../../queries/useRepo';

export function RemotesTab() {
  const { data, isLoading, error } = useRemotes();
  if (isLoading) return <div className="p-3 text-fg-muted text-xs">Loading…</div>;
  if (error) return <div className="p-3 text-git-deleted text-xs">{(error as Error).message}</div>;
  if (!data || data.length === 0) return <div className="p-3 text-fg-muted text-xs">No remotes.</div>;

  return (
    <div className="py-1 text-xs">
      {data.map((r) => (
        <div key={r.name} className="px-3 py-1.5 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Cloud className="w-3.5 h-3.5 text-git-remote shrink-0" />
            <span className="font-medium text-fg">{r.name}</span>
          </div>
          <div className="mt-1 ml-5 text-xxs text-fg-muted truncate" title={r.fetchUrl ?? ''}>
            {r.fetchUrl ?? '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

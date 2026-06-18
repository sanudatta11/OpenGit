import { useState } from 'react';
import { Cloud } from 'lucide-react';
import { useRemotes } from '../../queries/useRepo';

export function RemotesTab() {
  const { data, isLoading, error } = useRemotes();
  const [filter, setFilter] = useState('');

  if (isLoading) return <div className="p-3 text-fg-muted text-xs">Loading…</div>;
  if (error) return <div className="p-3 text-git-deleted text-xs">{(error as Error).message}</div>;
  if (!data || data.length === 0) return <div className="p-3 text-fg-muted text-xs">No remotes.</div>;

  const filtered = data.filter((r) =>
    r.name.toLowerCase().includes(filter.toLowerCase()) ||
    (r.fetchUrl && r.fetchUrl.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div className="py-1 text-xs">
      <div className="px-3 py-1">
        <input
          className="input w-full"
          placeholder="Filter remotes..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {filtered.length === 0 && (
        <div className="px-3 py-2 text-fg-dim">No remotes found.</div>
      )}

      {filtered.map((r) => (
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

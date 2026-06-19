// src/components/inspector/BlameView.tsx — git blame gutter + content for a single file.

import { useBlame } from '../../queries/useRepo';
import type { BlameEntry } from '@shared/ipc';

function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

function formatDate(unixTs: string): string {
  const ts = parseInt(unixTs, 10);
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function BlameView({ path, ref }: { path: string; ref?: string }) {
  const { data, isLoading, error } = useBlame(path, ref);

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-fg-muted">Loading blame…</div>;
  }
  if (error) {
    return <div className="flex-1 flex items-center justify-center text-xs text-git-deleted">{(error as Error).message}</div>;
  }
  if (!data || data.length === 0) {
    return <div className="flex-1 flex items-center justify-center text-xs text-fg-muted">No blame data available.</div>;
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto font-mono text-xxs">
      {data.map((entry, i) => (
        <BlameRow key={i} entry={entry} hoveredAuthor={null} />
      ))}
    </div>
  );
}

function BlameRow({ entry }: { entry: BlameEntry; hoveredAuthor: string | null }) {
  return (
    <div className="flex border-b border-border-subtle/20 hover:bg-bg-hover/30 min-h-[1.375rem]">
      <div className="w-[200px] shrink-0 flex items-center gap-1.5 px-2 py-px text-xxs border-r border-border-subtle/20 bg-bg/10">
        <span className="shrink-0 text-accent font-medium">{shortSha(entry.sha)}</span>
        <span className="flex-1 truncate text-fg-muted">{entry.author}</span>
        <span className="shrink-0 text-fg-dim">{formatDate(entry.authorDate)}</span>
      </div>
      <div className="flex-1 px-2 py-px whitespace-pre text-fg min-w-0 overflow-x-auto">
        {entry.content}
      </div>
    </div>
  );
}

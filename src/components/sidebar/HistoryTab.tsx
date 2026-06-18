// src/components/sidebar/HistoryTab.tsx — recent commits list (compact).

import { useLog } from '../../queries/useRepo';
import { useRepoStore, cacheCommits } from '../../stores/repo';
import type { Commit } from '@shared/git';
import { useEffect } from 'react';

export function HistoryTab() {
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const selectedSha = useRepoStore((s) => s.selectedCommitSha);
  const log = useLog(undefined, 0, 100);

  useEffect(() => {
    if (log.data?.commits) cacheCommits(log.data.commits);
  }, [log.data]);

  if (log.isLoading) return <div className="p-3 text-fg-muted text-xs">Loading…</div>;
  if (log.error) return <div className="p-3 text-git-deleted text-xs">{(log.error as Error).message}</div>;
  if (!log.data || log.data.commits.length === 0) {
    return <div className="p-3 text-fg-muted text-xs">No commits yet.</div>;
  }

  return (
    <div className="py-1">
      {log.data.commits.map((c) => (
        <CommitRow
          key={c.sha}
          commit={c}
          selected={c.sha === selectedSha}
          onClick={() => selectCommit(c.sha)}
        />
      ))}
      {log.data.hasMore && (
        <div className="p-2 text-center text-fg-dim text-xs">More below in graph…</div>
      )}
    </div>
  );
}

function CommitRow({ commit, selected, onClick }: { commit: Commit; selected: boolean; onClick: () => void }) {
  const date = new Date(commit.author.date);
  const ago = relativeTime(date);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 border-b border-border-subtle ${
        selected ? 'bg-accent/10' : 'row-hover'
      }`}
    >
      <div className="flex items-start gap-1.5">
        <span
          className="w-2 h-2 rounded-full mt-1 shrink-0"
          style={{ backgroundColor: laneColor(commit.lane) }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-fg truncate">{commit.subject}</div>
          <div className="flex items-center gap-1.5 mt-0.5 text-xxs text-fg-muted">
            <span className="truncate">{commit.author.name}</span>
            <span className="text-fg-dim">·</span>
            <span className="shrink-0">{ago}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

const PALETTE = [
  '#3b82f6', '#f85149', '#3fb950', '#d29922', '#a371f7',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#10b981',
  '#eab308', '#06b6d4',
];

export function laneColor(lane: number): string {
  if (lane < 0) return '#6e7681';
  return PALETTE[lane % PALETTE.length]!;
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

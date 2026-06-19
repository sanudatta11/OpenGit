// src/components/sidebar/StashTab.tsx — stash list + create/apply/pop/drop.

import { useState } from 'react';
import { Archive, Plus, Play, ArrowDownToLine, Trash2, Loader2 } from 'lucide-react';
import { useStashList, useStashCreate, useStashApply, useStashPop, useStashDrop } from '../../queries/useMutations';
import { ConfirmDialog } from '../ConfirmDialog';
import type { StashEntry } from '@shared/git';
import { api } from '../../ipc/api';

export function StashTab() {
  const { data, isLoading, error } = useStashList();
  const [showCreate, setShowCreate] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState<StashEntry | null>(null);
  const [confirmPop, setConfirmPop] = useState<StashEntry | null>(null);
  const [filter, setFilter] = useState('');
  const [expandedStash, setExpandedStash] = useState<string | null>(null);
  const [stashDiffContent, setStashDiffContent] = useState<string>('');
  const [stashDiffLoading, setStashDiffLoading] = useState(false);
  const drop = useStashDrop();
  const pop = useStashPop();

  if (isLoading) return <div className="p-3 text-fg-muted text-xs">Loading…</div>;
  if (error) return <div className="p-3 text-git-deleted text-xs">{(error as Error).message}</div>;

  const filtered = data?.filter((s) =>
    s.subject.toLowerCase().includes(filter.toLowerCase()) ||
    s.ref.toLowerCase().includes(filter.toLowerCase())
  ) ?? [];

  return (
    <div className="py-1 text-xs">
      <div className="px-3 py-1 label flex items-center justify-between">
        <span>Stashes</span>
        <button className="icon-btn !w-6 !h-6" onClick={() => setShowCreate(!showCreate)} title="New stash">
          <Plus className="w-3 h-3" />
        </button>
      </div>

      <div className="px-3 py-1">
        <input
          className="input w-full"
          placeholder="Filter stashes..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {showCreate && <CreateStashForm onClose={() => setShowCreate(false)} />}

      {filtered.length === 0 && !showCreate && (
        <div className="px-3 py-2 text-fg-dim">No stashes found.</div>
      )}

      {filtered.map((s) => (
        <StashRow
          key={s.ref}
          entry={s}
          onDrop={() => setConfirmDrop(s)}
          onPop={() => setConfirmPop(s)}
          onToggleDiff={() => {
            if (expandedStash === s.ref) {
              setExpandedStash(null);
              setStashDiffContent('');
            } else {
              setExpandedStash(s.ref);
              setStashDiffLoading(true);
              api.stash.diff({ ref: s.ref }).then((d) => {
                setStashDiffContent(d);
                setStashDiffLoading(false);
              }).catch(() => setStashDiffLoading(false));
            }
          }}
          expanded={expandedStash === s.ref}
          diffLoading={expandedStash === s.ref && stashDiffLoading}
          diffContent={expandedStash === s.ref ? stashDiffContent : ''}
        />
      ))}

      <ConfirmDialog
        open={!!confirmDrop}
        title="Drop stash?"
        message={`Drop "${confirmDrop?.ref}"? This cannot be undone.`}
        confirmLabel="Drop"
        danger
        onConfirm={() => {
          if (confirmDrop) void drop.mutate({ ref: confirmDrop.ref });
          setConfirmDrop(null);
        }}
        onCancel={() => setConfirmDrop(null)}
      />

      <ConfirmDialog
        open={!!confirmPop}
        title="Pop stash?"
        message={`Pop "${confirmPop?.ref}"? This applies and drops the stash. If conflicts occur, the stash is kept.`}
        confirmLabel="Pop"
        onConfirm={() => {
          if (confirmPop) void pop.mutate({ ref: confirmPop.ref });
          setConfirmPop(null);
        }}
        onCancel={() => setConfirmPop(null)}
      />
    </div>
  );
}

function StashRow({ entry, onDrop, onPop, onToggleDiff, expanded, diffLoading, diffContent }: { entry: StashEntry; onDrop: () => void; onPop: () => void; onToggleDiff: () => void; expanded: boolean; diffLoading: boolean; diffContent: string }) {
  const apply = useStashApply();
  const pop = useStashPop();
  const drop = useStashDrop();

  const date = new Date(entry.date);
  return (
    <div className="px-3 py-1.5 border-b border-border-subtle/30">
      <div className="flex items-center gap-2">
        <Archive className="w-3.5 h-3.5 shrink-0 text-git-stash" />
        <button
          className="font-mono text-fg-muted text-xxs shrink-0 hover:text-accent cursor-pointer"
          onClick={onToggleDiff}
          title="Toggle diff preview"
        >
          {entry.ref}
        </button>
        <span className="text-xs text-fg-dim ml-auto shrink-0">{formatRelative(date)}</span>
      </div>
      <div className="mt-1 text-xs text-fg truncate" title={entry.subject}>{entry.subject}</div>
      {entry.branch && (
        <div className="mt-0.5 text-xs text-fg-dim">on {entry.branch}</div>
      )}
      {expanded && (
        <div className="mt-2 border-t border-border-subtle pt-2 max-h-40 overflow-y-auto">
          {diffLoading ? (
            <div className="text-xs text-fg-muted flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading diff...</div>
          ) : diffContent ? (
            <pre className="text-xs font-mono text-fg-muted whitespace-pre-wrap">{diffContent.slice(0, 4000)}{diffContent.length > 4000 ? '\n...truncated' : ''}</pre>
          ) : (
            <div className="text-xs text-fg-dim">No diff available.</div>
          )}
        </div>
      )}
      <div className="mt-1.5 flex items-center gap-1">
        <button
          className="icon-btn !w-6 !h-6"
          onClick={() => apply.mutate({ ref: entry.ref })}
          disabled={apply.isPending || pop.isPending}
          title="Apply (keep stash)"
        >
          {apply.isPending && apply.variables?.ref === entry.ref ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
        </button>
        <button
          className="icon-btn !w-6 !h-6"
          onClick={onPop}
          disabled={apply.isPending || pop.isPending}
          title="Pop (apply + drop)"
        >
          <ArrowDownToLine className="w-3 h-3" />
        </button>
        <button
          className="icon-btn !w-6 !h-6 hover:text-git-deleted ml-auto"
          onClick={onDrop}
          disabled={drop.isPending}
          title="Drop"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

function CreateStashForm({ onClose }: { onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [includeUntracked, setIncludeUntracked] = useState(false);
  const [keepIndex, setKeepIndex] = useState(false);
  const create = useStashCreate();

  const handleSubmit = () => {
    void create.mutate(
      { message: message.trim() || undefined, includeUntracked, keepIndex },
      { onSuccess: () => { setMessage(''); onClose(); } },
    );
  };

  return (
    <div className="px-3 py-2 border-b border-border-subtle space-y-2">
      <input
        className="input w-full"
        placeholder="Stash message (optional)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        autoFocus
      />
      <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
        <input type="checkbox" checked={includeUntracked} onChange={(e) => setIncludeUntracked(e.target.checked)} className="accent-accent" />
        Include untracked
      </label>
      <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
        <input type="checkbox" checked={keepIndex} onChange={(e) => setKeepIndex(e.target.checked)} className="accent-accent" />
        Keep index
      </label>
      <div className="flex justify-end gap-1">
        <button className="btn !text-xs !px-2 !py-0.5" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary !text-xs !px-2 !py-0.5"
          onClick={handleSubmit}
          disabled={create.isPending}
        >
          {create.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Stash'}
        </button>
      </div>
    </div>
  );
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString();
}

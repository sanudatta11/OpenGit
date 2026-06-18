// src/components/sidebar/BranchesTab.tsx — list local/remote branches + tags + checkout/create/delete.

import { useState } from 'react';
import { GitBranch, Tag, Cloud, Check, Plus, Trash2, Loader2 } from 'lucide-react';
import { useBranches } from '../../queries/useRepo';
import { useCheckout, useCreateBranch, useDeleteBranch } from '../../queries/useMutations';
import type { Branch, RefKind } from '@shared/git';
import { ConfirmDialog } from '../ConfirmDialog';

export function BranchesTab() {
  const { data, isLoading, error } = useBranches();
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const del = useDeleteBranch();

  if (isLoading) return <div className="p-3 text-fg-muted text-xs">Loading…</div>;
  if (error) return <div className="p-3 text-git-deleted text-xs">{(error as Error).message}</div>;
  if (!data || data.length === 0) return (
    <div className="p-3">
      <div className="text-fg-muted text-xs mb-2">No refs.</div>
      <button className="btn w-full justify-center" onClick={() => setShowCreate(true)}>
        <Plus className="w-3.5 h-3.5" /> New branch
      </button>
      {showCreate && <CreateBranchForm onClose={() => setShowCreate(false)} />}
    </div>
  );

  const filtered = data.filter((b) =>
    b.shortName.toLowerCase().includes(filter.toLowerCase())
  );

  const locals = filtered.filter((b) => b.kind === 'local');
  const remotes = filtered.filter((b) => b.kind === 'remote');
  const tags = filtered.filter((b) => b.kind === 'tag');

  return (
    <div className="py-1 text-xs">
      <div className="px-3 py-1">
        <input
          className="input w-full"
          placeholder="Filter branches & tags..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <Section title="Local" count={locals.length} actions={
        <button className="icon-btn !w-5 !h-5" onClick={() => setShowCreate(!showCreate)} title="New branch">
          <Plus className="w-3 h-3" />
        </button>
      }>
        {showCreate && <CreateBranchForm onClose={() => setShowCreate(false)} />}
        {locals.map((b) => (
          <BranchRow key={b.name} branch={b} onDelete={setConfirmDelete} />
        ))}
      </Section>
      <Section title="Remote" count={remotes.length}>
        {remotes.map((b) => <BranchRow key={b.name} branch={b} />)}
      </Section>
      <Section title="Tags" count={tags.length}>
        {tags.map((b) => <BranchRow key={b.name} branch={b} />)}
      </Section>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete branch?"
        message={`Delete branch "${confirmDelete?.shortName}"?`}
        details={confirmDelete ? `This removes the ref refs/heads/${confirmDelete.shortName}. The commits remain reachable from other branches/tags until orphaned.` : undefined}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (confirmDelete) {
            void del.mutate({ name: confirmDelete.shortName, force: false });
            setConfirmDelete(null);
          }
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function Section({ title, count, actions, children }: { title: string; count: number; actions?: React.ReactNode; children: React.ReactNode }) {
  if (count === 0 && !actions) return null;
  return (
    <div className="mb-2">
      <div className="px-3 py-1 label flex items-center justify-between">
        <span>{title}</span>
        <div className="flex items-center gap-1">
          {actions}
          {count > 0 && <span className="text-fg-dim">{count}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}

function formatRelative(d: Date): string {
  const diff = Date.now() - d.getTime();
  const s = Math.floor(diff / 1000);
  if (isNaN(s)) return 'unknown';
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

function BranchRow({ branch, onDelete }: { branch: Branch; onDelete?: (b: Branch) => void }) {
  const Icon = iconFor(branch.kind);
  const checkout = useCheckout();
  const del = useDeleteBranch();

  const handleCheckout = () => {
    if (branch.kind === 'local') {
      void checkout.mutate({ ref: branch.shortName });
    } else if (branch.kind === 'remote') {
      // For remote branches, create a local tracking branch.
      const localName = branch.shortName.split('/').pop() ?? branch.shortName;
      void checkout.mutate({ ref: localName, create: true });
    }
  };

  return (
    <div
      className="w-full text-left px-3 py-1 row-hover flex items-start gap-2"
      title={branch.name}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${colorFor(branch.kind)}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 justify-between">
          <button
            className={`truncate text-left hover:text-accent font-medium ${branch.isHead ? 'text-fg font-semibold' : 'text-fg-muted'}`}
            onClick={handleCheckout}
            title={branch.kind === 'tag' ? 'Tags cannot be checked out directly' : `Checkout ${branch.shortName}`}
            disabled={checkout.isPending || branch.kind === 'tag'}
          >
            {branch.shortName}
          </button>
          <div className="flex items-center gap-1 shrink-0">
            {branch.isHead && <Check className="w-3 h-3 text-git-head" />}
            {branch.upstreamTrack && (branch.upstreamTrack.ahead > 0 || branch.upstreamTrack.behind > 0) && (
              <span className="text-xxs text-fg-dim">
                {branch.upstreamTrack.ahead > 0 && `↑${branch.upstreamTrack.ahead}`}
                {branch.upstreamTrack.ahead > 0 && branch.upstreamTrack.behind > 0 && ' '}
                {branch.upstreamTrack.behind > 0 && `↓${branch.upstreamTrack.behind}`}
              </span>
            )}
            {checkout.isPending && checkout.variables?.ref === branch.shortName && (
              <Loader2 className="w-3 h-3 animate-spin" />
            )}
            {branch.kind === 'local' && !branch.isHead && onDelete && (
              <button
                className="icon-btn !w-5 !h-5 hover:text-git-deleted opacity-60 hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); onDelete(branch); }}
                disabled={del.isPending}
                title="Delete branch"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        <div className="text-xxs text-fg-dim flex items-center gap-1.5 truncate mt-0.5 font-mono">
          <span>{branch.sha.slice(0, 7)}</span>
          <span>·</span>
          <span>{formatRelative(new Date(branch.date))}</span>
        </div>
      </div>
    </div>
  );
}

function CreateBranchForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [start, setStart] = useState('HEAD');
  const [checkout, setCheckout] = useState(true);
  const create = useCreateBranch();

  const handleSubmit = () => {
    if (!name.trim()) return;
    void create.mutate(
      { name: name.trim(), start: start.trim() || 'HEAD', checkout },
      { onSuccess: () => { setName(''); onClose(); } },
    );
  };

  return (
    <div className="px-3 py-2 border-b border-border-subtle space-y-2">
      <input
        className="input w-full"
        placeholder="Branch name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
        autoFocus
      />
      <input
        className="input w-full"
        placeholder="Start point (default: HEAD)"
        value={start}
        onChange={(e) => setStart(e.target.value)}
      />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xxs text-fg-muted cursor-pointer">
          <input
            type="checkbox"
            checked={checkout}
            onChange={(e) => setCheckout(e.target.checked)}
            className="accent-accent"
          />
          Checkout
        </label>
        <div className="flex items-center gap-1">
          <button className="btn !text-xxs !px-2 !py-0.5" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-primary !text-xxs !px-2 !py-0.5"
            onClick={handleSubmit}
            disabled={create.isPending || !name.trim()}
          >
            {create.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create'}
          </button>
        </div>
      </div>
      {create.error && <div className="text-xxs text-git-deleted">{(create.error as Error).message}</div>}
    </div>
  );
}

function iconFor(k: RefKind): typeof GitBranch {
  return k === 'tag' ? Tag : k === 'remote' ? Cloud : GitBranch;
}
function colorFor(k: RefKind): string {
  return k === 'tag' ? 'text-git-tag' : k === 'remote' ? 'text-git-remote' : 'text-git-branch';
}

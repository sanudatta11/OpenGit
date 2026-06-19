// src/components/sidebar/BranchesTab.tsx — list local/remote branches + tags + checkout/create/delete.

import { useState, useEffect } from 'react';
import { GitBranch, Tag, Cloud, Check, Plus, Trash2, Loader2, ChevronDown } from 'lucide-react';
import { useBranches } from '../../queries/useRepo';
import { useCheckout, useCreateBranch, useDeleteBranch } from '../../queries/useMutations';
import { useQueryClient } from '@tanstack/react-query';
import type { Branch, RefKind } from '@shared/git';
import { ConfirmDialog } from '../ConfirmDialog';
import { api } from '../../ipc/api';
import { useToastStore } from '../../stores/toast';
import { useRepoStore } from '../../stores/repo';

export function BranchesTab() {
  const { data, isLoading, error } = useBranches();
  const [confirmDelete, setConfirmDelete] = useState<Branch | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');
  const del = useDeleteBranch();
  const qc = useQueryClient();
  const [showTagCreate, setShowTagCreate] = useState(false);
  const [tagName, setTagName] = useState('');
  const [tagStart, setTagStart] = useState('HEAD');
  const [createWorktreeBranch, setCreateWorktreeBranch] = useState<Branch | null>(null);
  const [worktreePath, setWorktreePath] = useState('');
  const [worktreeLock, setWorktreeLock] = useState('');
  const repoName = useRepoStore((s) => s.repo?.path?.split('/').pop() ?? 'repo');
  const [showFlow, setShowFlow] = useState(false);

  const handleCreateWorktree = (b: Branch) => {
    setCreateWorktreeBranch(b);
    setWorktreePath(`../${repoName}-${b.shortName}`);
    setWorktreeLock('');
  };
  const handleTagCreate = async () => {
    if (!tagName.trim()) return;
    try {
      await api.terminal.run(`git tag -a ${tagName.trim()} ${tagStart.trim() || 'HEAD'} -m "${tagName.trim()}"`);
      setTagName('');
      setTagStart('HEAD');
      setShowTagCreate(false);
      void qc.invalidateQueries({ queryKey: ['branches'] });
    } catch (err) {
      console.error('Tag create failed:', err);
    }
  };

  const handleTagDelete = async (branch: Branch) => {
    try {
      await api.terminal.run(`git tag -d ${branch.shortName}`);
      void qc.invalidateQueries({ queryKey: ['branches'] });
    } catch (err) {
      console.error('Tag delete failed:', err);
    }
  };

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

      <div className="px-3 py-1">
        <button
          className="w-full flex items-center gap-1.5 text-xxs text-fg-muted hover:text-fg transition-colors"
          onClick={() => setShowFlow(!showFlow)}
        >
          <ChevronDown className={`w-3 h-3 transition-transform ${showFlow ? 'rotate-180' : ''}`} />
          Git Flow
        </button>
        {showFlow && <GitFlowSection />}
      </div>

      <Section title="Local" count={locals.length} actions={
        <button className="icon-btn !w-5 !h-5" onClick={() => setShowCreate(!showCreate)} title="New branch">
          <Plus className="w-3 h-3" />
        </button>
      }>
        {showCreate && <CreateBranchForm onClose={() => setShowCreate(false)} />}
        {locals.map((b) => (
          <BranchRow key={b.name} branch={b} onDelete={setConfirmDelete} onCreateWorktree={handleCreateWorktree} />
        ))}
      </Section>
      <Section title="Remote" count={remotes.length}>
        {remotes.map((b) => <BranchRow key={b.name} branch={b} onCreateWorktree={handleCreateWorktree} />)}
      </Section>
      <Section title="Tags" count={tags.length} actions={
        <button className="icon-btn !w-5 !h-5" onClick={() => setShowTagCreate(!showTagCreate)} title="New tag">
          <Plus className="w-3 h-3" />
        </button>
      }>
        {showTagCreate && (
          <div className="px-3 py-2 border-b border-border-subtle space-y-2">
            <input
              className="input w-full"
              placeholder="Tag name"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTagCreate(); }}
              autoFocus
            />
            <input
              className="input w-full"
              placeholder="Start point (default: HEAD)"
              value={tagStart}
              onChange={(e) => setTagStart(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleTagCreate(); }}
            />
            <div className="flex items-center justify-end gap-1">
              <button className="btn !text-xxs !px-2 !py-0.5" onClick={() => { setShowTagCreate(false); setTagName(''); setTagStart('HEAD'); }}>Cancel</button>
              <button
                className="btn btn-primary !text-xxs !px-2 !py-0.5"
                onClick={handleTagCreate}
                disabled={!tagName.trim()}
              >
                Create Tag
              </button>
            </div>
          </div>
        )}
        {tags.map((b) => <BranchRow key={b.name} branch={b} onDelete={handleTagDelete} />)}
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

      <ConfirmDialog
        open={!!createWorktreeBranch}
        title="Create Worktree"
        message={`Create a new worktree for branch "${createWorktreeBranch?.shortName}"?`}
        confirmLabel="Create"
        onConfirm={() => {
          if (createWorktreeBranch) {
            void api.worktree.create({ path: worktreePath, branch: createWorktreeBranch.shortName, start: createWorktreeBranch.shortName, lock: worktreeLock || undefined })
              .then(() => { qc.invalidateQueries(); useToastStore.getState().addToast('Worktree created', 'success'); });
            setCreateWorktreeBranch(null);
            setWorktreeLock('');
          }
        }}
        onCancel={() => { setCreateWorktreeBranch(null); setWorktreeLock(''); }}
      >
        <input className="input w-full mt-2" placeholder="Path" value={worktreePath} onChange={(e) => setWorktreePath(e.target.value)} />
        <input className="input w-full mt-2" placeholder="Lock reason (optional)" value={worktreeLock} onChange={(e) => setWorktreeLock(e.target.value)} />
      </ConfirmDialog>
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

function BranchRow({ branch, onDelete, onCreateWorktree }: { branch: Branch; onDelete?: (b: Branch) => void; onCreateWorktree?: (b: Branch) => void }) {
  const Icon = iconFor(branch.kind);
  const checkout = useCheckout();
  const del = useDeleteBranch();

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [renameName, setRenameName] = useState('');
  const [showRename, setShowRename] = useState(false);
  const [upstreamVal, setUpstreamVal] = useState('');
  const [showUpstream, setShowUpstream] = useState(false);

  const handleContextMenu = (e: React.MouseEvent) => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY }); };
  useEffect(() => { const close = () => setCtxMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close); }, []);

  const handleCheckout = () => {
    if (branch.kind === 'local') {
      void checkout.mutate({ ref: branch.shortName });
    } else if (branch.kind === 'remote') {
      const localName = branch.shortName.split('/').pop() ?? branch.shortName;
      void checkout.mutate({ ref: localName, create: true });
    }
  };

  return (
    <>
      <div
        className="w-full text-left px-3 py-1 row-hover flex items-start gap-2"
        title={branch.name}
        onContextMenu={handleContextMenu}
        style={{ cursor: 'context-menu' }}
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
              {branch.kind === 'tag' && onDelete && (
                <button
                  className="icon-btn !w-5 !h-5 hover:text-git-deleted opacity-60 hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); onDelete(branch); }}
                  title="Delete tag"
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

      {showRename && (
        <div className="px-3 py-2 border-b border-border-subtle space-y-2">
          <input className="input w-full" placeholder="New name" value={renameName} onChange={(e) => setRenameName(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { void api.branch.rename(branch.shortName, renameName).then(() => setShowRename(false)); } }} />
          <div className="flex justify-end gap-1">
            <button className="btn !text-xxs !px-2 !py-0.5" onClick={() => setShowRename(false)}>Cancel</button>
            <button className="btn btn-primary !text-xxs !px-2 !py-0.5" onClick={() => { void api.branch.rename(branch.shortName, renameName).then(() => setShowRename(false)); }}>Rename</button>
          </div>
        </div>
      )}

      {showUpstream && (
        <div className="px-3 py-2 border-b border-border-subtle space-y-2">
          <input className="input w-full" placeholder="Upstream (e.g. origin/main)" value={upstreamVal} onChange={(e) => setUpstreamVal(e.target.value)} autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { void api.branch.setUpstream(branch.shortName, upstreamVal).then(() => setShowUpstream(false)); } }} />
          <div className="flex justify-end gap-1">
            <button className="btn !text-xxs !px-2 !py-0.5" onClick={() => setShowUpstream(false)}>Cancel</button>
            <button className="btn btn-primary !text-xxs !px-2 !py-0.5" onClick={() => { void api.branch.setUpstream(branch.shortName, upstreamVal).then(() => setShowUpstream(false)); }}>Set</button>
          </div>
        </div>
      )}

      {ctxMenu && (
        <div className="fixed z-50 bg-bg-panel border border-border rounded shadow-xl py-1 w-48 text-xs" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
          {!branch.isHead && <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover" onClick={() => { void checkout.mutate({ ref: branch.shortName }); setCtxMenu(null); }}>Checkout</button>}
          {onCreateWorktree && <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover" onClick={() => { onCreateWorktree(branch); setCtxMenu(null); }}>Create worktree</button>}
          {!branch.isHead && branch.kind === 'local' && <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover" onClick={() => { setShowRename(true); setRenameName(branch.shortName); setCtxMenu(null); }}>Rename</button>}
          <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover" onClick={() => { navigator.clipboard.writeText(branch.shortName); setCtxMenu(null); }}>Copy name</button>
          {branch.kind === 'local' && !branch.isHead && <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover" onClick={() => { setShowUpstream(true); setUpstreamVal(branch.upstream ?? ''); setCtxMenu(null); }}>Set Upstream</button>}
          {branch.kind === 'local' && !branch.isHead && onDelete && <div className="border-t border-border my-1" />}
          {branch.kind === 'local' && !branch.isHead && onDelete && <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-git-deleted" onClick={() => { onDelete(branch); setCtxMenu(null); }}>Delete</button>}
        </div>
      )}
    </>
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

function GitFlowSection() {
  const [featureName, setFeatureName] = useState('');
  const [hotfixName, setHotfixName] = useState('');
  const [releaseName, setReleaseName] = useState('');
  const create = useCreateBranch();

  const handleStart = (prefix: string, name: string) => {
    if (!name.trim()) return;
    void create.mutate({ name: `${prefix}/${name.trim()}`, start: 'HEAD', checkout: true });
  };

  return (
    <div className="mt-1 space-y-2">
      <div className="space-y-1">
        <span className="text-xxs text-fg-dim font-medium">Start Feature</span>
        <div className="flex items-center gap-1">
          <span className="text-xxs text-fg-dim shrink-0">feature/</span>
          <input
            className="input w-full !text-xxs !py-0.5"
            placeholder="name"
            value={featureName}
            onChange={(e) => setFeatureName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleStart('feature', featureName); setFeatureName(''); } }}
          />
          <button
            className="btn btn-primary !text-xxs !px-2 !py-0.5 shrink-0"
            onClick={() => { handleStart('feature', featureName); setFeatureName(''); }}
            disabled={create.isPending || !featureName.trim()}
          >
            Start
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-xxs text-fg-dim font-medium">Start Hotfix</span>
        <div className="flex items-center gap-1">
          <span className="text-xxs text-fg-dim shrink-0">hotfix/</span>
          <input
            className="input w-full !text-xxs !py-0.5"
            placeholder="name"
            value={hotfixName}
            onChange={(e) => setHotfixName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleStart('hotfix', hotfixName); setHotfixName(''); } }}
          />
          <button
            className="btn btn-primary !text-xxs !px-2 !py-0.5 shrink-0"
            onClick={() => { handleStart('hotfix', hotfixName); setHotfixName(''); }}
            disabled={create.isPending || !hotfixName.trim()}
          >
            Start
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <span className="text-xxs text-fg-dim font-medium">Start Release</span>
        <div className="flex items-center gap-1">
          <span className="text-xxs text-fg-dim shrink-0">release/</span>
          <input
            className="input w-full !text-xxs !py-0.5"
            placeholder="name"
            value={releaseName}
            onChange={(e) => setReleaseName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { handleStart('release', releaseName); setReleaseName(''); } }}
          />
          <button
            className="btn btn-primary !text-xxs !px-2 !py-0.5 shrink-0"
            onClick={() => { handleStart('release', releaseName); setReleaseName(''); }}
            disabled={create.isPending || !releaseName.trim()}
          >
            Start
          </button>
        </div>
      </div>
    </div>
  );
}

function iconFor(k: RefKind): typeof GitBranch {
  return k === 'tag' ? Tag : k === 'remote' ? Cloud : GitBranch;
}
function colorFor(k: RefKind): string {
  return k === 'tag' ? 'text-git-tag' : k === 'remote' ? 'text-git-remote' : 'text-git-branch';
}

// src/components/sidebar/WorktreesTab.tsx — worktree list + create/remove/prune.

import { useState, useEffect } from 'react';
import { FolderTree, Plus, Trash2, Sparkles, Loader2, Lock, AlertTriangle, Check } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import { ConfirmDialog } from '../ConfirmDialog';
import { useOpenRepo } from '../../queries/useRepo';
import { useToastStore } from '../../stores/toast';
import { useRepoStore } from '../../stores/repo';
import type { Worktree } from '@shared/git';

const qk = { worktrees: ['worktrees'] as const };

export function WorktreesTab() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: qk.worktrees,
    queryFn: () => api.worktree.list(),
    refetchOnWindowFocus: false,
  });
  const [showCreate, setShowCreate] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Worktree | null>(null);
  const [confirmPrune, setConfirmPrune] = useState(false);
  const prune = useMutation({
    mutationFn: () => api.worktree.prune(),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.worktrees }),
  });
  const remove = useMutation({
    mutationFn: (input: { path: string; force: boolean }) => api.worktree.remove(input as never),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.worktrees }),
  });

  if (isLoading) return <div className="p-3 text-fg-muted text-xs">Loading…</div>;
  if (error) return <div className="p-3 text-git-deleted text-xs">{(error as Error).message}</div>;

  return (
    <div className="py-1 text-xs">
      <div className="px-3 py-1 label flex items-center justify-between">
        <span>Worktrees</span>
        <div className="flex items-center gap-1">
          {data && data.length > 1 && (
            <button
              className="icon-btn !w-6 !h-6"
              onClick={() => setConfirmPrune(true)}
              title="Prune stale worktrees"
            >
              <Sparkles className="w-3 h-3" />
            </button>
          )}
          <button className="icon-btn !w-6 !h-6" onClick={() => setShowCreate(!showCreate)} title="New worktree">
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>

      {showCreate && <CreateWorktreeForm onClose={() => setShowCreate(false)} />}

      {(!data || data.length === 0) && !showCreate && (
        <div className="px-3 py-2 text-fg-dim">No worktrees.</div>
      )}

      {data?.map((wt) => (
        <WorktreeRow
          key={wt.path}
          wt={wt}
          onRemove={() => setConfirmRemove(wt)}
        />
      ))}

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove worktree?"
        message={`Remove the worktree at "${confirmRemove?.path}"?`}
        details={confirmRemove?.isMain ? 'This is the main worktree and cannot be removed.' : undefined}
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (confirmRemove) void remove.mutate({ path: confirmRemove.path, force: false });
          setConfirmRemove(null);
        }}
        onCancel={() => setConfirmRemove(null)}
      />

      <ConfirmDialog
        open={confirmPrune}
        title="Prune stale worktrees?"
        message="Remove worktree metadata for directories that no longer exist on disk?"
        confirmLabel="Prune"
        onConfirm={() => { void prune.mutate(); setConfirmPrune(false); }}
        onCancel={() => setConfirmPrune(false)}
      />
    </div>
  );
}

function WorktreeRow({ wt, onRemove }: { wt: Worktree; onRemove: () => void }) {
  const pathParts = wt.path.split('/');
  const dirName = pathParts.pop() ?? wt.path;
  const parentPath = pathParts.join('/');

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [lockReason, setLockReason] = useState('');
  const [showLockDialog, setShowLockDialog] = useState(false);

  const openRepo = useOpenRepo();
  const qc = useQueryClient();
  const repoPath = useRepoStore((s) => s.activeRepo?.path);
  const isActive = repoPath === wt.path;

  const lockMutation = useMutation({
    mutationFn: (reason?: string) => api.worktree.lock(wt.path, reason),
    onSuccess: () => { qc.invalidateQueries(); useToastStore.getState().addToast('Worktree locked', 'success'); },
  });
  const unlockMutation = useMutation({
    mutationFn: () => api.worktree.unlock(wt.path),
    onSuccess: () => { qc.invalidateQueries(); useToastStore.getState().addToast('Worktree unlocked', 'success'); },
  });
  const removeMutation = useMutation({
    mutationFn: (force?: boolean) => api.worktree.remove({ path: wt.path, force: force ?? false }),
    onSuccess: () => { qc.invalidateQueries(); useToastStore.getState().addToast('Worktree removed', 'success'); },
  });
  const removeAndDeleteMutation = useMutation({
    mutationFn: (force?: boolean) => api.worktree.removeAndDelete(wt.path, wt.branch?.replace('refs/heads/', '') ?? '', force ?? false),
    onSuccess: () => { qc.invalidateQueries(); useToastStore.getState().addToast('Worktree and branch removed', 'success'); },
  });

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const close = () => setCtxMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  return (
    <>
      <div
        className={`px-3 py-1.5 border-b border-border-subtle/30 ${isActive ? 'bg-accent/10 border-l-2 border-l-accent' : ''}`}
        onContextMenu={handleContextMenu}
        style={{ cursor: 'context-menu' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <FolderTree className={`w-3.5 h-3.5 shrink-0 ${wt.isMain ? 'text-git-head' : 'text-git-worktree'}`} />
          <span className="text-fg font-medium min-w-0 break-words flex-1" title={wt.path}>{dirName}</span>
          {wt.isMain && <span className="text-xxs text-git-head shrink-0">main</span>}
          {wt.bare && <span className="text-xxs text-fg-dim shrink-0">bare</span>}
          {wt.detached && <span className="text-xxs text-fg-dim shrink-0">detached</span>}
          {isActive && <Check className="w-3 h-3 text-accent shrink-0 ml-auto" />}
        </div>
        <div className="mt-0.5 ml-5 text-xs text-fg-dim min-w-0 break-all" title={wt.path}>{parentPath}/</div>
        {wt.branch && (
          <div className="mt-0.5 ml-5 text-xs text-git-branch font-mono truncate">
            {wt.branch.replace('refs/heads/', '')}
          </div>
        )}
        <div className="mt-1 ml-5 flex items-center gap-2">
          {wt.locked !== null && (
            <span className="flex items-center gap-0.5 text-xxs text-git-modified" title={wt.locked || 'locked'}>
              <Lock className="w-2.5 h-2.5" /> locked
            </span>
          )}
          {wt.prunable && (
            <span className="flex items-center gap-0.5 text-xxs text-git-conflicted">
              <AlertTriangle className="w-2.5 h-2.5" /> prunable
            </span>
          )}
          {!wt.isMain && (
            <button
              className="icon-btn !w-6 !h-6 hover:text-git-deleted ml-auto"
              onClick={onRemove}
              title="Remove worktree"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
          {wt.isMain && !isActive && <Check className="w-3 h-3 text-git-added ml-auto" />}
        </div>
      </div>

      {showLockDialog && (
        <div className="px-3 py-2 border-b border-border-subtle space-y-2">
          <input className="input w-full" placeholder="Lock reason (optional)" value={lockReason} onChange={(e) => setLockReason(e.target.value)} autoFocus />
          <div className="flex justify-end gap-1">
            <button className="btn !text-xs !px-2 !py-0.5" onClick={() => setShowLockDialog(false)}>Cancel</button>
            <button className="btn btn-primary !text-xs !px-2 !py-0.5" onClick={() => { lockMutation.mutate(lockReason || undefined); setShowLockDialog(false); setLockReason(''); }}>Lock</button>
          </div>
        </div>
      )}

      {ctxMenu && (
        <div className="fixed z-50 bg-bg-panel border border-border rounded shadow-xl py-1 w-48 text-xs" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
          <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover" onClick={() => { openRepo.mutateAsync(wt.path); setCtxMenu(null); }}>Open this worktree</button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover" onClick={() => { window.api.shell.openPath(wt.path); setCtxMenu(null); }}>Open in File Manager</button>
          <div className="border-t border-border my-1" />
          {wt.locked !== null ? (
            <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover" onClick={() => { unlockMutation.mutate(); setCtxMenu(null); }}>Unlock this worktree</button>
          ) : (
            <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover" onClick={() => { setShowLockDialog(true); setCtxMenu(null); }}>Lock this worktree</button>
          )}
          <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-git-deleted" onClick={() => { removeMutation.mutate(false); setCtxMenu(null); }}>Remove this worktree</button>
          {wt.branch && (
            <button className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-git-deleted" onClick={() => { removeAndDeleteMutation.mutate(false); setCtxMenu(null); }}>Remove worktree and delete branch</button>
          )}
        </div>
      )}
    </>
  );
}

function CreateWorktreeForm({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [path, setPath] = useState('');
  const [branch, setBranch] = useState('');
  const [start, setStart] = useState('HEAD');
  const [lock, setLock] = useState('');
  const create = useMutation({
    mutationFn: (input: { path: string; branch?: string; start: string; lock?: string }) =>
      api.worktree.create(input as never),
    onSuccess: () => { qc.invalidateQueries({ queryKey: qk.worktrees }); onClose(); },
  });

  const handleSubmit = () => {
    if (!path.trim()) return;
    void create.mutate({
      path: path.trim(),
      branch: branch.trim() || undefined,
      start: start.trim() || 'HEAD',
      lock: lock.trim() || undefined,
    });
  };

  return (
    <div className="px-3 py-2 border-b border-border-subtle space-y-2">
      <input
        className="input w-full"
        placeholder="Path (e.g. ../my-repo-feature)"
        value={path}
        onChange={(e) => setPath(e.target.value)}
        autoFocus
      />
      <input
        className="input w-full"
        placeholder="Branch name (empty = detached)"
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
      />
      <input
        className="input w-full"
        placeholder="Start point (default: HEAD)"
        value={start}
        onChange={(e) => setStart(e.target.value)}
      />
      <input
        className="input w-full"
        placeholder="Lock reason (optional)"
        value={lock}
        onChange={(e) => setLock(e.target.value)}
      />
      <div className="flex justify-end gap-1">
        <button className="btn !text-xs !px-2 !py-0.5" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-primary !text-xs !px-2 !py-0.5"
          onClick={handleSubmit}
          disabled={create.isPending || !path.trim()}
        >
          {create.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Create'}
        </button>
      </div>
      {create.error && <div className="text-xs text-git-deleted">{(create.error as Error).message}</div>}
    </div>
  );
}

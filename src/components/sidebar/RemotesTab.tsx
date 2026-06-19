import { useState } from 'react';
import { Cloud, Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useRemotes } from '../../queries/useRepo';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import { remoteUrlClassName } from './overflow';

export function RemotesTab() {
  const { data, isLoading, error } = useRemotes();
  const [filter, setFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newRemoteName, setNewRemoteName] = useState('');
  const [newRemoteUrl, setNewRemoteUrl] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const handleAdd = async () => {
    if (!newRemoteName.trim() || !newRemoteUrl.trim()) return;
    setAdding(true);
    try {
      await api.remote.add(newRemoteName.trim(), newRemoteUrl.trim());
      setNewRemoteName('');
      setNewRemoteUrl('');
      setShowAdd(false);
      void qc.invalidateQueries({ queryKey: ['remotes'] });
    } catch (err) {
      console.error('Add remote failed:', err);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (name: string) => {
    try {
      await api.remote.remove(name);
      void qc.invalidateQueries({ queryKey: ['remotes'] });
    } catch (err) {
      console.error('Remove remote failed:', err);
    }
  };

  const handleSaveUrl = async (name: string) => {
    if (!editUrl.trim()) return;
    setSaving(true);
    try {
      await api.remote.setUrl(name, editUrl.trim());
      setEditingName(null);
      setEditUrl('');
      void qc.invalidateQueries({ queryKey: ['remotes'] });
    } catch (err) {
      console.error('Set URL failed:', err);
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="p-3 text-fg-muted text-xs">Loading…</div>;
  if (error) return <div className="p-3 text-git-deleted text-xs">{(error as Error).message}</div>;

  const filtered = (data ?? []).filter((r) =>
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

      {filtered.length === 0 && !showAdd && (
        <div className="px-3 py-2 text-fg-dim">No remotes found.</div>
      )}

      {filtered.map((r) => (
        <div key={r.name} className="px-3 py-1.5 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Cloud className="w-3.5 h-3.5 text-git-remote shrink-0" />
            <span className="font-medium text-fg">{r.name}</span>
            <div className="flex-1" />
            <button
              className="icon-btn !w-6 !h-6 hover:text-accent"
              onClick={() => { setEditingName(r.name); setEditUrl(r.fetchUrl ?? ''); }}
              title="Edit remote URL"
            >
              <Pencil className="w-3 h-3" />
            </button>
            <button
              className="icon-btn !w-6 !h-6 hover:text-git-deleted"
              onClick={() => handleRemove(r.name)}
              title="Remove remote"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          {editingName === r.name ? (
            <div className="mt-1 ml-5 flex items-center gap-1">
              <input
                className="input flex-1"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveUrl(r.name); if (e.key === 'Escape') setEditingName(null); }}
                autoFocus
              />
              <button
                className="btn !text-xs !px-2 !py-0.5 btn-primary"
                onClick={() => handleSaveUrl(r.name)}
                disabled={saving}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
              </button>
              <button
                className="btn !text-xs !px-2 !py-0.5"
                onClick={() => setEditingName(null)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className={`mt-1 ml-5 ${remoteUrlClassName()}`} title={r.fetchUrl ?? ''}>
              {r.fetchUrl ?? '—'}
            </div>
          )}
        </div>
      ))}

      {showAdd && (
        <div className="px-3 py-2 border-t border-border-subtle space-y-2">
          <input
            className="input w-full"
            placeholder="Remote name (e.g. origin)"
            value={newRemoteName}
            onChange={(e) => setNewRemoteName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            autoFocus
          />
          <input
            className="input w-full"
            placeholder="Remote URL"
            value={newRemoteUrl}
            onChange={(e) => setNewRemoteUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
          />
          <div className="flex items-center justify-end gap-1">
            <button className="btn !text-xs !px-2 !py-0.5" onClick={() => { setShowAdd(false); setNewRemoteName(''); setNewRemoteUrl(''); }}>Cancel</button>
            <button
              className="btn btn-primary !text-xs !px-2 !py-0.5"
              onClick={handleAdd}
              disabled={adding || !newRemoteName.trim() || !newRemoteUrl.trim()}
            >
              {adding ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
            </button>
          </div>
        </div>
      )}

      {!showAdd && (
        <div className="px-3 py-2">
          <button className="btn w-full justify-center text-xs" onClick={() => setShowAdd(true)}>
            <Plus className="w-3 h-3" /> Add Remote
          </button>
        </div>
      )}
    </div>
  );
}

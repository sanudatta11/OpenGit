// src/components/SettingsPanel.tsx — modal settings panel (git path, diff view, recent repos).

import { useEffect, useState } from 'react';
import { Settings, X, FolderOpen, Trash2, Loader2, Check } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../ipc/api';
import type { SettingsData } from '@shared/ipc';

export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-bg-panel border border-border rounded-lg shadow-xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex items-center justify-between border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-fg-muted" />
            <h3 className="text-sm font-semibold text-fg">Settings</h3>
          </div>
          <button className="icon-btn" onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          <GitPathSection />
          <DiffSection />
          <ThemeSection />
          <FontSizeSection />
          <DefaultBranchSection />
          <PullStrategySection />
          <CommitSection />
          <SigningSection />
          <ExternalEditorSection />
          <RecentReposSection />
        </div>
      </div>
    </div>
  );
}

function GitPathSection() {
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const qc = useQueryClient();
  const [path, setPath] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setPath(data.gitBinPath ?? '');
  }, [data]);

  const save = useMutation({
    mutationFn: (gitBinPath: string | null) => api.settings.set({ gitBinPath }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  const handleSave = () => {
    setSaving(true);
    void save.mutate(path.trim() || null, { onSettled: () => setSaving(false) });
  };

  return (
    <section>
      <h4 className="label mb-2">Git Binary</h4>
      <p className="text-xs text-fg-muted mb-2">
        Path to the git executable. Leave empty to auto-detect from PATH.
      </p>
      <div className="flex gap-2">
        <input
          className="input flex-1 font-mono"
          placeholder="auto-detect"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          disabled={isLoading || saving}
        />
        <button className="btn" onClick={handleSave} disabled={saving || isLoading}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5 text-git-added" /> : 'Save'}
        </button>
      </div>
      {save.error && <div className="mt-1 text-xs text-git-deleted">{(save.error as Error).message}</div>}
    </section>
  );
}

function DiffSection() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const qc = useQueryClient();
  const setSetting = useMutation({
    mutationFn: (input: Partial<SettingsData>) => api.settings.set(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <section>
      <h4 className="label mb-2">Diff Viewer</h4>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-fg-muted block mb-1">Default view</label>
          <div className="flex gap-1">
            {(['side-by-side', 'unified'] as const).map((v) => (
              <button
                key={v}
                className={`btn !text-xxs ${data?.defaultDiffView === v ? 'btn-primary' : ''}`}
                onClick={() => void setSetting.mutate({ defaultDiffView: v })}
              >
                {v === 'side-by-side' ? 'Split' : 'Unified'}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-xs text-fg-muted block mb-1">Context lines: {data?.contextLines ?? 3}</label>
          <input
            type="range"
            min={0}
            max={20}
            value={data?.contextLines ?? 3}
            onChange={(e) => void setSetting.mutate({ contextLines: Number(e.target.value) })}
            className="w-full accent-accent"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
          <input
            type="checkbox"
            checked={data?.showUntracked ?? true}
            onChange={(e) => void setSetting.mutate({ showUntracked: e.target.checked })}
            className="accent-accent"
          />
          Show untracked files in status
        </label>
      </div>
    </section>
  );
}

function ThemeSection() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const qc = useQueryClient();
  const setSetting = useMutation({
    mutationFn: (input: Partial<SettingsData>) => api.settings.set(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <section>
      <h4 className="label mb-2">Theme</h4>
      <div className="flex gap-1">
        {(['system', 'dark', 'light'] as const).map((v) => (
          <button
            key={v}
            className={`btn !text-xxs ${data?.theme === v ? 'btn-primary' : ''}`}
            onClick={() => void setSetting.mutate({ theme: v })}
          >
            {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>
    </section>
  );
}

function FontSizeSection() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const qc = useQueryClient();
  const setSetting = useMutation({
    mutationFn: (input: Partial<SettingsData>) => api.settings.set(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <section>
      <h4 className="label mb-2">Font Size: {data?.fontSize ?? 14}px</h4>
      <input
        type="range"
        min={10}
        max={22}
        value={data?.fontSize ?? 14}
        onChange={(e) => void setSetting.mutate({ fontSize: Number(e.target.value) })}
        className="w-full accent-accent"
      />
    </section>
  );
}

function DefaultBranchSection() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const qc = useQueryClient();
  const setSetting = useMutation({
    mutationFn: (input: Partial<SettingsData>) => api.settings.set(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
  const [branch, setBranch] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setBranch(data.defaultBranch ?? 'main');
  }, [data]);

  const handleSave = () => {
    void setSetting.mutate({ defaultBranch: branch.trim() || 'main' }, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1500); },
    });
  };

  return (
    <section>
      <h4 className="label mb-2">Default Branch</h4>
      <div className="flex gap-2">
        <input
          className="input flex-1 font-mono"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        />
        <button className="btn" onClick={handleSave} disabled={setSetting.isPending}>
          {setSetting.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5 text-git-added" /> : 'Save'}
        </button>
      </div>
    </section>
  );
}

function PullStrategySection() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const qc = useQueryClient();
  const setSetting = useMutation({
    mutationFn: (input: Partial<SettingsData>) => api.settings.set(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <section>
      <h4 className="label mb-2">Default Pull Strategy</h4>
      <div className="flex gap-2">
        {(['merge', 'rebase', 'ff-only'] as const).map((v) => (
          <label key={v} className="flex items-center gap-1.5 cursor-pointer text-xs text-fg-muted hover:text-fg">
            <input
              type="radio"
              name="pullStrategy"
              checked={data?.pullStrategy === v}
              onChange={() => void setSetting.mutate({ pullStrategy: v })}
              className="accent-accent"
            />
            <span className="capitalize">{v === 'ff-only' ? 'FF Only' : v}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function CommitSection() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const qc = useQueryClient();
  const setSetting = useMutation({
    mutationFn: (input: Partial<SettingsData>) => api.settings.set(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <section>
      <h4 className="label mb-2">Commit</h4>
      <div className="space-y-2">
        <div>
          <label className="text-xs text-fg-muted block mb-1">Subject length: {data?.commitSubjectLength ?? 72}</label>
          <input
            type="range"
            min={40}
            max={120}
            value={data?.commitSubjectLength ?? 72}
            onChange={(e) => void setSetting.mutate({ commitSubjectLength: Number(e.target.value) })}
            className="w-full accent-accent"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
          <input
            type="checkbox"
            checked={data?.conventionalCommitValidation ?? false}
            onChange={(e) => void setSetting.mutate({ conventionalCommitValidation: e.target.checked })}
            className="accent-accent"
          />
          Enforce conventional commit format
        </label>
      </div>
    </section>
  );
}

function SigningSection() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const qc = useQueryClient();
  const setSetting = useMutation({
    mutationFn: (input: Partial<SettingsData>) => api.settings.set(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <section>
      <h4 className="label mb-2">Commit Signing</h4>
      <div className="flex gap-2">
        {(['none', 'gpg', 'ssh'] as const).map((v) => (
          <label key={v} className="flex items-center gap-1.5 cursor-pointer text-xs text-fg-muted hover:text-fg">
            <input
              type="radio"
              name="signingMode"
              checked={data?.signingMode === v}
              onChange={() => void setSetting.mutate({ signingMode: v })}
              className="accent-accent"
            />
            <span className="uppercase">{v}</span>
          </label>
        ))}
      </div>
    </section>
  );
}

function ExternalEditorSection() {
  const { data } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const qc = useQueryClient();
  const setSetting = useMutation({
    mutationFn: (input: Partial<SettingsData>) => api.settings.set(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
  const [editor, setEditor] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setEditor(data.defaultExternalEditor ?? '');
  }, [data]);

  const handleSave = () => {
    void setSetting.mutate({ defaultExternalEditor: editor.trim() || null }, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 1500); },
    });
  };

  return (
    <section>
      <h4 className="label mb-2">External Editor</h4>
      <div className="flex gap-2">
        <input
          className="input flex-1 font-mono"
          placeholder="e.g. code, nvim, subl"
          value={editor}
          onChange={(e) => setEditor(e.target.value)}
        />
        <button className="btn" onClick={handleSave} disabled={setSetting.isPending}>
          {setSetting.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5 text-git-added" /> : 'Save'}
        </button>
      </div>
    </section>
  );
}

function RecentReposSection() {
  const { data: repos, isLoading } = useQuery({
    queryKey: ['recentRepos'],
    queryFn: () => api.settings.recentRepos(),
  });
  const qc = useQueryClient();
  const removeRecent = useMutation({
    mutationFn: (path: string) => api.settings.removeRecent(path),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recentRepos'] }),
  });

  return (
    <section>
      <h4 className="label mb-2">Recent Repositories</h4>
      {isLoading && <div className="text-xs text-fg-muted">Loading…</div>}
      {repos && repos.length === 0 && <div className="text-xs text-fg-dim">No recent repos.</div>}
      <div className="space-y-1">
        {repos?.map((path) => {
          const name = path.split('/').pop() ?? path;
          return (
            <div key={path} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-bg-hover group">
              <FolderOpen className="w-3.5 h-3.5 text-fg-muted shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-fg truncate">{name}</div>
                <div className="text-xxs text-fg-dim truncate">{path}</div>
              </div>
              <button
                className="icon-btn !w-5 !h-5 opacity-0 group-hover:opacity-100 hover:text-git-deleted"
                onClick={() => removeRecent.mutate(path)}
                title="Remove from recent"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

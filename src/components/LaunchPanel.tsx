// src/components/LaunchPanel.tsx — dashboard / repository entry panel.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Download, FolderOpen, FolderPlus, Loader2, Search, Settings, Trash2 } from 'lucide-react';
import { api } from '../ipc/api';
import { useRepoStore } from '../stores/repo';
import { GitError } from '@shared/ipc';
import { rankKnownRepos, type KnownRepoEntry } from './dashboard/search';
import { useSwitchRepo } from '../queries/useRepo';

type Mode = 'open' | 'clone' | 'create';

export function LaunchPanel({ onOpenSettings }: { onOpenSettings: () => void }) {
  const qc = useQueryClient();
  const addRepo = useRepoStore((s) => s.addRepo);
  const focusRepoTab = useRepoStore((s) => s.focusRepoTab);
  const tabs = useRepoStore((s) => s.tabs);
  const switchRepo = useSwitchRepo();
  const [mode, setMode] = useState<Mode>('open');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const recent = useQuery({
    queryKey: ['recentRepos'],
    queryFn: () => api.settings.recentRepos(),
  });

  const removeRecent = useMutation({
    mutationFn: (path: string) => api.repo.removeFromApp(path),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recentRepos'] }),
  });

  const adoptCurrentRepo = async () => {
    const head = await api.repo.head();
    if (head) addRepo(head);
    void qc.invalidateQueries();
  };

  const openPath = async (path: string) => {
    if (focusRepoTab(path)) {
      switchRepo.mutate(path);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const repo = await api.repo.open(path);
      addRepo(repo);
      void qc.invalidateQueries();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const pickAndOpen = async () => {
    const path = await api.dialog.pickRepo();
    if (path) await openPath(path);
  };

  const knownRepos = useMemo<KnownRepoEntry[]>(() => {
    const openRepoEntries = tabs
      .filter((tab) => tab.kind === 'repo')
      .map((tab) => ({
        path: tab.repoPath,
        name: tab.repoPath.split('/').pop() ?? tab.repoPath,
        isOpen: true,
        recencyRank: 0,
      }));

    const recencyLookup = new Map<string, number>();
    for (const [index, path] of (recent.data ?? []).entries()) {
      recencyLookup.set(path, Math.max((recent.data?.length ?? 0) - index, 1));
    }

    const merged = new Map<string, KnownRepoEntry>();
    for (const entry of openRepoEntries) {
      merged.set(entry.path, {
        ...entry,
        recencyRank: recencyLookup.get(entry.path) ?? 0,
      });
    }

    for (const path of recent.data ?? []) {
      merged.set(path, {
        path,
        name: path.split('/').pop() ?? path,
        isOpen: merged.get(path)?.isOpen ?? false,
        recencyRank: recencyLookup.get(path) ?? 0,
      });
    }

    return rankKnownRepos([...merged.values()], searchQuery);
  }, [recent.data, searchQuery, tabs]);

  const gitError = GitError.is(error) ? GitError.fromSerialized(error) : null;

  return (
    <div className="h-full flex flex-col bg-bg select-none">
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-5xl grid grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] gap-6 max-lg:grid-cols-1">
        <section className="min-w-0">
          <div className="mb-5">
            <div className="text-xxs uppercase tracking-wider text-accent font-semibold">OpenGit Dashboard</div>
            <h1 className="mt-1 text-2xl font-semibold text-fg">Open or create a repository</h1>
            <p className="mt-1 text-sm text-fg-muted">Fast launcher for recent and open repositories, with local clone/create workflows.</p>
          </div>

          <div className="flex items-center gap-1 mb-3">
            <ModeButton active={mode === 'open'} onClick={() => setMode('open')} icon={FolderOpen} label="Open" />
            <ModeButton active={mode === 'clone'} onClick={() => setMode('clone')} icon={Download} label="Clone" />
            <ModeButton active={mode === 'create'} onClick={() => setMode('create')} icon={FolderPlus} label="Create" />
          </div>

          <div className="border border-border bg-bg-panel rounded-lg p-4">
            {mode === 'open' && (
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-fg">Open Repository</div>
                  <div className="text-xs text-fg-muted mt-0.5">Choose an existing local working tree.</div>
                </div>
                <button className="btn btn-primary px-3 py-2" onClick={pickAndOpen} disabled={busy}>
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
                  Open Repository
                </button>
              </div>
            )}
            {mode === 'clone' && <CloneForm busy={busy} setBusy={setBusy} setError={setError} onDone={adoptCurrentRepo} />}
            {mode === 'create' && <CreateForm busy={busy} setBusy={setBusy} setError={setError} onDone={adoptCurrentRepo} />}
          </div>

          {gitError && (
            <div className="mt-3 flex items-start gap-2 p-3 rounded border border-git-deleted/40 bg-git-deleted/10 text-fg">
              <AlertTriangle className="w-4 h-4 mt-0.5 text-git-deleted shrink-0" />
              <div>
                <div className="font-medium text-git-deleted">{gitError.code}</div>
                <p className="text-xs text-fg-muted mt-0.5">{gitError.friendly || gitError.message}</p>
              </div>
            </div>
          )}
        </section>

        <aside className="border border-border bg-bg-panel rounded-lg min-w-0">
          <div className="h-10 px-3 flex items-center justify-between border-b border-border">
            <span className="label">Recent And Open Repositories</span>
            <button className="icon-btn !w-7 !h-7" onClick={onOpenSettings} title="Settings">
              <Settings className="w-4 h-4" />
            </button>
          </div>
          <div className="px-3 py-2 border-b border-border">
            <label className="flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-2 py-2">
              <Search className="w-4 h-4 text-fg-muted shrink-0" />
              <input
                className="flex-1 bg-transparent outline-none text-sm text-fg"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search known repositories"
              />
            </label>
          </div>
          <div className="p-2 max-h-[420px] overflow-y-auto">
            {knownRepos.length > 0 ? knownRepos.map((entry) => (
              <div key={entry.path} className="group flex items-center gap-2 rounded px-2 py-2 hover:bg-bg-hover">
                <button className="flex-1 min-w-0 text-left" onClick={() => openPath(entry.path)} disabled={busy}>
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-fg truncate">{entry.name}</div>
                    {entry.isOpen && <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">Open</span>}
                  </div>
                  <div className="text-xs text-fg-dim truncate">{entry.path}</div>
                </button>
                <button
                  className="icon-btn !w-7 !h-7 opacity-60 group-hover:opacity-100 hover:text-git-deleted"
                  onClick={() => removeRecent.mutate(entry.path)}
                  title="Remove from app"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )) : (
              <div className="px-2 py-8 text-center text-xs text-fg-muted">No known repositories match your search.</div>
            )}
          </div>
        </aside>
      </div>
    </div>
    </div>
  );
}

function ModeButton({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof FolderOpen; label: string }) {
  return (
    <button className={`btn ${active ? 'btn-primary' : ''}`} onClick={onClick}>
      <Icon className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function CloneForm({ busy, setBusy, setError, onDone }: FormProps) {
  const [url, setUrl] = useState('');
  const [destinationParent, setDestinationParent] = useState('');
  const [repoName, setRepoName] = useState('');
  const [recursiveSubmodules, setRecursiveSubmodules] = useState(false);
  const [shallowDepth, setShallowDepth] = useState('');

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.repo.clone({
        url,
        destinationParent,
        repoName: repoName || undefined,
        recursiveSubmodules,
        shallowDepth: shallowDepth ? Number(shallowDepth) : undefined,
      });
      if (!result.success) throw new Error(result.stderr || result.stdout || 'Clone failed');
      await onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Clone URL" value={url} onChange={setUrl} placeholder="https://github.com/org/repo.git" />
      <DirectoryField label="Destination" value={destinationParent} onChange={setDestinationParent} />
      <Field label="Repository name" value={repoName} onChange={setRepoName} placeholder="Auto-detect" />
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input type="checkbox" checked={recursiveSubmodules} onChange={(e) => setRecursiveSubmodules(e.target.checked)} className="accent-accent" />
          Recursive submodules
        </label>
        <input className="input w-28" value={shallowDepth} onChange={(e) => setShallowDepth(e.target.value)} placeholder="Depth" />
      </div>
      <button className="btn btn-primary" onClick={submit} disabled={busy || !url.trim() || !destinationParent.trim()}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        Clone Repository
      </button>
    </div>
  );
}

function CreateForm({ busy, setBusy, setError, onDone }: FormProps) {
  const [path, setPath] = useState('');
  const [repoName, setRepoName] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [bare, setBare] = useState(false);
  const [readme, setReadme] = useState(true);
  const [gitignore, setGitignore] = useState('');
  const [license, setLicense] = useState('');

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.repo.create({
        path,
        repoName: repoName || undefined,
        defaultBranch,
        bare,
        readme,
        gitignore: gitignore || undefined,
        license: license ? license as 'MIT' | 'Apache-2.0' | 'GPL-3.0' : undefined,
      });
      if (!result.success) throw new Error(result.stderr || result.stdout || 'Create failed');
      await onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <DirectoryField label="Parent or repository path" value={path} onChange={setPath} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Repository name" value={repoName} onChange={setRepoName} placeholder="Optional" />
        <Field label="Default branch" value={defaultBranch} onChange={setDefaultBranch} placeholder="main" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label=".gitignore" value={gitignore} onChange={setGitignore} placeholder="node_modules&#10;dist" />
        <label className="block">
          <span className="label block mb-1">License</span>
          <select className="input w-full" value={license} onChange={(e) => setLicense(e.target.value)}>
            <option value="">None</option>
            <option value="MIT">MIT</option>
            <option value="Apache-2.0">Apache-2.0</option>
            <option value="GPL-3.0">GPL-3.0</option>
          </select>
        </label>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} className="accent-accent" disabled={bare} />
          README
        </label>
        <label className="flex items-center gap-2 text-xs text-fg-muted">
          <input type="checkbox" checked={bare} onChange={(e) => setBare(e.target.checked)} className="accent-accent" />
          Bare repository
        </label>
      </div>
      <button className="btn btn-primary" onClick={submit} disabled={busy || !path.trim() || !defaultBranch.trim()}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
        Create Repository
      </button>
    </div>
  );
}

interface FormProps {
  busy: boolean;
  setBusy: (busy: boolean) => void;
  setError: (error: unknown) => void;
  onDone: () => Promise<void>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="label block mb-1">{label}</span>
      <input className="input w-full" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function DirectoryField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const pick = async () => {
    const path = await api.dialog.pickDirectory();
    if (path) onChange(path);
  };
  return (
    <label className="block">
      <span className="label block mb-1">{label}</span>
      <div className="flex gap-2">
        <input className="input flex-1 min-w-0" value={value} onChange={(e) => onChange(e.target.value)} placeholder="/path/to/folder" />
        <button type="button" className="icon-btn border border-border bg-bg-elevated" onClick={pick} title="Choose directory">
          <FolderOpen className="w-4 h-4" />
        </button>
      </div>
    </label>
  );
}

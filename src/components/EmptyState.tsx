// src/components/EmptyState.tsx — shown when no repo is open. Offers recent repos + open dialog.

import { FolderOpen, Loader2, AlertTriangle, Clock, Settings } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../ipc/api';
import { GitError } from '@shared/ipc';

export function EmptyState({ onOpenSettings }: { onOpenSettings: () => void }) {
  const qc = useQueryClient();
  const openRepo = useMutation({
    mutationFn: (path: string) => api.repo.open(path),
    onSuccess: () => qc.invalidateQueries(),
  });
  const [busy, setBusy] = useState(false);

  const recent = useQuery({
    queryKey: ['recentRepos'],
    queryFn: () => api.settings.recentRepos(),
  });

  const handleOpen = async () => {
    const path = await api.dialog.pickRepo();
    if (!path) return;
    setBusy(true);
    try {
      await openRepo.mutateAsync(path);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const handleRecent = async (path: string) => {
    setBusy(true);
    try {
      await openRepo.mutateAsync(path);
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const err = openRepo.error as unknown;
  const gitNotFound = err instanceof GitError && err.code === 'GitNotFound';
  const notARepo = err instanceof GitError && err.code === 'NotARepo';

  return (
    <div className="h-full flex flex-col items-center justify-center gap-6 select-none">
      <div className="flex flex-col items-center gap-3">
        <div className="w-16 h-16 rounded-xl bg-bg-panel border border-border flex items-center justify-center">
          <FolderOpen className="w-8 h-8 text-accent" />
        </div>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-fg">OpenGit</h1>
          <p className="text-fg-muted text-sm">Open a local repository to get started.</p>
        </div>
      </div>

      <button className="btn btn-primary px-4 py-2" onClick={handleOpen} disabled={busy}>
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderOpen className="w-4 h-4" />}
        Open Repository
      </button>

      {recent.data && recent.data.length > 0 && (
        <div className="w-full max-w-md">
          <div className="label flex items-center gap-1.5 mb-2 px-1">
            <Clock className="w-3 h-3" /> Recent
          </div>
          <div className="space-y-1">
            {recent.data.slice(0, 5).map((path) => {
              const name = path.split('/').pop() ?? path;
              return (
                <button
                  key={path}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded bg-bg-panel border border-border hover:bg-bg-hover hover:border-border-strong transition-colors text-left"
                  onClick={() => handleRecent(path)}
                  disabled={busy}
                >
                  <FolderOpen className="w-4 h-4 text-fg-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-fg truncate">{name}</div>
                    <div className="text-xxs text-fg-dim truncate">{path}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <button className="btn !text-xs" onClick={onOpenSettings}>
        <Settings className="w-3.5 h-3.5" /> Settings
      </button>

      {gitNotFound && (
        <div className="flex items-start gap-2 max-w-md p-3 rounded border border-git-deleted/40 bg-git-deleted/10 text-fg">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-git-deleted shrink-0" />
          <div>
            <div className="font-medium text-git-deleted">Git not found</div>
            <p className="text-xs text-fg-muted mt-0.5">
              {(err as GitError).friendly} Open Settings to set the Git path manually.
            </p>
          </div>
        </div>
      )}

      {notARepo && (
        <div className="flex items-start gap-2 max-w-md p-3 rounded border border-git-modified/40 bg-git-modified/10 text-fg">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-git-modified shrink-0" />
          <div>
            <div className="font-medium text-git-modified">Not a Git repository</div>
            <p className="text-xs text-fg-muted mt-0.5">{(err as GitError).friendly}</p>
          </div>
        </div>
      )}
    </div>
  );
}

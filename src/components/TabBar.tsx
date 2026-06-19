// src/components/TabBar.tsx — multi-repo tab bar with '+' to open new repos.

import { useRepoStore, repoName } from '../stores/repo';
import { useSwitchRepo, useCloseRepo, useOpenRepo } from '../queries/useRepo';
import { Plus, X } from 'lucide-react';

export function TabBar() {
  const repos = useRepoStore((s) => s.repos);
  const activePath = useRepoStore((s) => s.activeRepo?.path ?? null);
  const switchRepo = useSwitchRepo();
  const closeRepo = useCloseRepo();
  const openRepo = useOpenRepo();

  const handleOpen = async () => {
    const path = await window.api.dialog.pickRepo();
    if (path) await openRepo.mutateAsync(path);
  };

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {repos.map((r) => {
        const name = repoName(r);
        const isActive = r.path === activePath;
        return (
          <button
            key={r.path}
            className={`group flex items-center gap-1 px-2.5 py-1 text-xs rounded-t-md border-b-2 transition-colors max-w-[180px] ${
              isActive
                ? 'bg-bg border-b-accent text-fg font-medium'
                : 'bg-bg-panel border-b-transparent text-fg-muted hover:bg-bg-hover hover:text-fg'
            }`}
            onClick={() => {
              if (!isActive) {
                switchRepo.mutate(r.path);
              }
            }}
            title={r.path}
          >
            <span className="truncate">{name}</span>
            <X
              className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-git-deleted rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                closeRepo.mutate(r.path);
              }}
            />
          </button>
        );
      })}
      <button
        className="flex items-center justify-center w-7 h-7 rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg transition-colors shrink-0"
        onClick={handleOpen}
        title="Open another repository"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

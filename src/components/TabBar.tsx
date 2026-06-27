// src/components/TabBar.tsx — session tab bar with repo and dashboard tabs.

import { useRepoStore, repoName } from '../stores/repo';
import { useCloseRepo } from '../queries/useRepo';
import { Plus, X } from 'lucide-react';

export function TabBar() {
  const tabs = useRepoStore((s) => s.tabs);
  const activeTabId = useRepoStore((s) => s.activeTabId);
  const activateTab = useRepoStore((s) => s.activateTab);
  const openDashboardTab = useRepoStore((s) => s.openDashboardTab);
  const closeRepo = useCloseRepo();

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isRepoTab = tab.kind === 'repo';
        const name = isRepoTab
          ? repoName(tab.repoInfo ?? {
            path: tab.repoPath,
            gitDir: '',
            isBare: false,
            isShallow: false,
            isDetached: false,
            headSha: null,
            currentBranch: null,
            gitVersion: '',
          })
          : 'Dashboard';
        return (
          <button
            key={tab.id}
            className={`group flex items-center gap-1 px-2.5 py-1 text-xs rounded-t-md border-b-2 transition-colors max-w-[180px] ${
              isActive
                ? 'bg-bg border-b-accent text-fg font-medium'
                : 'bg-bg-panel border-b-transparent text-fg-muted hover:bg-bg-hover hover:text-fg'
            }`}
            onClick={() => {
              if (!isActive) {
                activateTab(tab.id);
              }
            }}
            title={isRepoTab ? tab.repoPath : 'Dashboard'}
          >
            <span className="truncate">{name}</span>
            {!isRepoTab && <span className="text-[10px] uppercase tracking-wider text-fg-dim">Home</span>}
            <X
              className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-git-deleted rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                if (isRepoTab) {
                  closeRepo.mutate(tab.repoPath);
                } else {
                  useRepoStore.getState().closeTab(tab.id);
                }
              }}
            />
          </button>
        );
      })}
      <button
        className="flex items-center justify-center w-7 h-7 rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg transition-colors shrink-0"
        onClick={() => openDashboardTab()}
        title="New dashboard tab"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

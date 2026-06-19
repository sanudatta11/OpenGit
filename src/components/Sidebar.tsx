import { GitBranch, Cloud, Archive, FolderTree } from 'lucide-react';
import { useRepoStore, type SidebarTab } from '../stores/repo';
import { BranchesTab } from './sidebar/BranchesTab';
import { RemotesTab } from './sidebar/RemotesTab';
import { StashTab } from './sidebar/StashTab';
import { WorktreesTab } from './sidebar/WorktreesTab';
import { useStatus, useRemotes } from '../queries/useRepo';

const TABS: ReadonlyArray<{ id: SidebarTab; label: string; icon: typeof GitBranch }> = [
  { id: 'branches', label: 'Branches', icon: GitBranch },
  { id: 'remotes', label: 'Remotes', icon: Cloud },
  { id: 'stash', label: 'Stash', icon: Archive },
  { id: 'worktrees', label: 'Worktrees', icon: FolderTree },
];

export function Sidebar() {
  const tab = useRepoStore((s) => s.sidebarTab);
  const setTab = useRepoStore((s) => s.setSidebarTab);

  return (
    <aside className="h-full shrink-0 flex bg-bg-panel border-r border-border">
      <nav className="w-12 shrink-0 border-r border-border flex flex-col items-center pt-2 gap-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              className={`w-9 h-9 flex items-center justify-center rounded transition-colors ${
                active ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-bg-hover hover:text-fg'
              }`}
              onClick={() => setTab(t.id)}
              title={t.label}
              aria-label={t.label}
              aria-pressed={active}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
        <div className="flex-1" />
        <div className="w-full border-t border-border pt-2 pb-2 flex flex-col items-center">
          <div className="w-9 h-9 flex items-center justify-center text-fg-dim text-xs font-mono select-none">
            OG
          </div>
        </div>
      </nav>
      <SidebarPanel tab={tab} />
    </aside>
  );
}

import { CircleDot } from 'lucide-react';

function RepositoryOverview() {
  const repo = useRepoStore((s) => s.repo);
  const status = useStatus();
  const remotes = useRemotes();

  if (!repo) return null;

  const branchName = repo.currentBranch ?? (repo.isDetached ? `detached at ${repo.headSha?.slice(0, 7)}` : 'HEAD');
  const upstream = status.data?.upstream ?? null;
  const ahead = status.data?.ahead ?? 0;
  const behind = status.data?.behind ?? 0;
  const remoteUrl = remotes.data?.[0]?.fetchUrl ?? null;
  const dirtyCount = status.data?.entries?.length ?? 0;

  return (
    <div className="p-3 border-b border-border bg-bg/25 space-y-2 select-none shrink-0 text-xs">
      <div className="flex items-center gap-1.5">
        <GitBranch className="w-3.5 h-3.5 text-git-branch shrink-0" />
        <span className="font-semibold text-fg truncate" title={branchName}>{branchName}</span>
      </div>

      {upstream && (
        <div className="flex items-center gap-1.5 text-xxs text-fg-muted">
          <Cloud className="w-3 h-3 text-git-remote shrink-0" />
          <span className="truncate" title={upstream}>upstream: {upstream}</span>
          {(ahead > 0 || behind > 0) && (
            <span className="flex items-center gap-0.5 ml-1 font-semibold shrink-0">
              {ahead > 0 && <span className="text-git-added">↑{ahead}</span>}
              {behind > 0 && <span className="text-git-remote">↓{behind}</span>}
            </span>
          )}
        </div>
      )}

      {remoteUrl && (
        <div className="flex items-center gap-1.5 text-xxs text-fg-dim">
          <Cloud className="w-3 h-3 text-fg-dim shrink-0" />
          <span className="truncate" title={remoteUrl}>{remoteUrl}</span>
        </div>
      )}

      <div className="flex items-center gap-1.5 text-xxs text-fg-muted">
        <CircleDot className={`w-3 h-3 shrink-0 ${dirtyCount > 0 ? 'text-git-modified' : 'text-git-added'}`} />
        <span>{dirtyCount === 0 ? 'Clean working tree' : `${dirtyCount} files changed`}</span>
      </div>
    </div>
  );
}

function SidebarPanel({ tab }: { tab: SidebarTab }) {
  return (
    <div
      className="w-64 shrink-0 bg-bg-panel flex flex-col min-h-0"
      data-tab={tab}
    >
      <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span className="label">{labelFor(tab)}</span>
      </div>
      <RepositoryOverview />
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'branches' && <BranchesTab />}
        {tab === 'remotes' && <RemotesTab />}
        {tab === 'stash' && <StashTab />}
        {tab === 'worktrees' && <WorktreesTab />}
      </div>
    </div>
  );
}

function labelFor(t: SidebarTab): string {
  return TABS.find((x) => x.id === t)?.label ?? '';
}

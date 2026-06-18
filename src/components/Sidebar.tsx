// src/components/Sidebar.tsx — left sidebar with tab switcher and tab content.

import { History, GitBranch, Cloud, Archive, FolderTree } from 'lucide-react';
import { useRepoStore, type SidebarTab } from '../stores/repo';
import { HistoryTab } from './sidebar/HistoryTab';
import { BranchesTab } from './sidebar/BranchesTab';
import { RemotesTab } from './sidebar/RemotesTab';
import { StashTab } from './sidebar/StashTab';
import { WorktreesTab } from './sidebar/WorktreesTab';

const TABS: ReadonlyArray<{ id: SidebarTab; label: string; icon: typeof History }> = [
  { id: 'history', label: 'History', icon: History },
  { id: 'branches', label: 'Branches', icon: GitBranch },
  { id: 'remotes', label: 'Remotes', icon: Cloud },
  { id: 'stash', label: 'Stash', icon: Archive },
  { id: 'worktrees', label: 'Worktrees', icon: FolderTree },
];

export function Sidebar() {
  const tab = useRepoStore((s) => s.sidebarTab);
  const setTab = useRepoStore((s) => s.setSidebarTab);

  return (
    <div className="w-12 border-r border-border bg-bg-panel flex flex-col items-center pt-2 gap-1 shrink-0">
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

      {/* Slide-over panel for the active tab. */}
      <div className="absolute left-12 top-10 bottom-0 w-64 bg-bg-panel border-r border-border z-10 hidden" id="sidebar-panel-host" />
      <SidebarPanel tab={tab} />
    </div>
  );
}

function SidebarPanel({ tab }: { tab: SidebarTab }) {
  // The sidebar panel is a fixed overlay that shows the active tab's content.
  // We use absolute positioning to overlay it without affecting layout.
  return (
    <div
      className="absolute left-12 top-10 bottom-0 w-64 bg-bg-panel border-r border-border z-20 flex flex-col"
      data-tab={tab}
    >
      <div className="h-9 px-3 flex items-center justify-between border-b border-border shrink-0">
        <span className="label">{labelFor(tab)}</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'history' && <HistoryTab />}
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

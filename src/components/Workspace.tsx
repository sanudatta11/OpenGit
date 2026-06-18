// src/components/Workspace.tsx — main 3-pane layout: sidebar | graph | inspector + log drawer.

import { useEffect } from 'react';
import { useRepoStore } from '../stores/repo';
import { useStatus } from '../queries/useRepo';
import { Sidebar } from './Sidebar';
import { GraphPane } from './graph/GraphPane';
import { Inspector } from './inspector/Inspector';
import { LogDrawer } from './LogDrawer';
import { TopBar } from './TopBar';
import { InProgressBanner } from './InProgressBanner';

export function Workspace({ onOpenSettings }: { onOpenSettings: () => void }) {
  const logDrawerOpen = useRepoStore((s) => s.logDrawerOpen);
  const status = useStatus();

  // Keyboard shortcut: Cmd/Ctrl+L toggles log drawer.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        useRepoStore.getState().toggleLogDrawer();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="h-full flex flex-col bg-bg">
      <TopBar onOpenSettings={onOpenSettings} />
      {status.data && status.data.states.length > 0 && (
        <InProgressBanner states={status.data.states} />
      )}
      <div className="flex-1 flex min-h-0">
        <Sidebar />
        <div className="flex-1 flex min-h-0">
          <GraphPane />
          <Inspector />
        </div>
      </div>
      {logDrawerOpen && <LogDrawer />}
    </div>
  );
}

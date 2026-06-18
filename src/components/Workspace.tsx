import { useEffect, useState } from 'react';
import { useRepoStore } from '../stores/repo';
import { useStatus, useOpenRepo } from '../queries/useRepo';
import { Sidebar } from './Sidebar';
import { GraphPane } from './graph/GraphPane';
import { Inspector } from './inspector/Inspector';
import { LogDrawer } from './LogDrawer';
import { TopBar } from './TopBar';
import { InProgressBanner } from './InProgressBanner';
import { CommandPalette } from './CommandPalette';
import { RepositorySearch } from './RepositorySearch';

export function Workspace({ onOpenSettings }: { onOpenSettings: () => void }) {
  const logDrawerOpen = useRepoStore((s) => s.logDrawerOpen);
  const status = useStatus();
  const openRepo = useOpenRepo();
  
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [repoSearchOpen, setRepoSearchOpen] = useState(false);

  // Keyboard shortcut listeners
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'l') {
          e.preventDefault();
          useRepoStore.getState().toggleLogDrawer();
        } else if (e.key === 'k') {
          e.preventDefault();
          setCommandPaletteOpen((prev) => !prev);
        } else if (e.key === 'p') {
          e.preventDefault();
          setRepoSearchOpen((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleOpenRepository = async () => {
    const path = await window.api.dialog.pickRepo();
    if (path) await openRepo.mutateAsync(path);
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      <TopBar onOpenSettings={onOpenSettings} />
      {status.data && status.data.states.length > 0 && (
        <InProgressBanner states={status.data.states} />
      )}
      <div className="flex-1 flex min-h-0 min-w-0">
        <Sidebar />
        <div className="flex-1 flex min-h-0 min-w-0">
          <GraphPane />
          <Inspector />
        </div>
      </div>
      {logDrawerOpen && <LogDrawer />}

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onOpenRepository={handleOpenRepository}
        onOpenSettings={onOpenSettings}
      />

      <RepositorySearch
        open={repoSearchOpen}
        onClose={() => setRepoSearchOpen(false)}
      />
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRepoStore } from '../stores/repo';
import { useStatus, useOpenRepo } from '../queries/useRepo';
import { api } from '../ipc/api';
import { Sidebar } from './Sidebar';
import { GraphPane } from './graph/GraphPane';
import { Inspector } from './inspector/Inspector';
import { LogDrawer } from './LogDrawer';
import { TopBar } from './TopBar';
import { InProgressBanner } from './InProgressBanner';
import { CommandPalette } from './CommandPalette';
import { RepositorySearch } from './RepositorySearch';
import { PushRejectionBanner } from './PushRejectionBanner';

export function Workspace({ onOpenSettings }: { onOpenSettings: () => void }) {
  const logDrawerOpen = useRepoStore((s) => s.logDrawerOpen);
  const status = useStatus();
  const openRepo = useOpenRepo();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const [sidebarWidth, setSidebarWidth] = useState(settings?.sidebarWidth ?? 256);
  const [inspectorWidth, setInspectorWidth] = useState(settings?.inspectorWidth ?? 360);

  useEffect(() => {
    if (settings?.sidebarWidth != null) setSidebarWidth(settings.sidebarWidth);
  }, [settings?.sidebarWidth]);

  useEffect(() => {
    if (settings?.inspectorWidth != null) setInspectorWidth(settings.inspectorWidth);
  }, [settings?.inspectorWidth]);

  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const inspectorWidthRef = useRef(inspectorWidth);
  inspectorWidthRef.current = inspectorWidth;

  const handleSidebarDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidthRef.current;
    const handleMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.min(480, Math.max(200, startWidth + (ev.clientX - startX)));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      api.settings.set({ sidebarWidth: sidebarWidthRef.current });
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleInspectorDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = inspectorWidthRef.current;
    const handleMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.min(600, Math.max(280, startWidth - (ev.clientX - startX)));
      setInspectorWidth(newWidth);
    };
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      api.settings.set({ inspectorWidth: inspectorWidthRef.current });
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

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
      <PushRejectionBanner />
      {status.data && status.data.states.length > 0 && (
        <InProgressBanner states={status.data.states} />
      )}
      <div className="flex-1 flex min-h-0 min-w-0">
        <Sidebar sidebarWidth={sidebarWidth} />
        <div
          className="w-1 shrink-0 cursor-col-resize hover:bg-accent/30 transition-colors bg-transparent"
          onMouseDown={handleSidebarDragStart}
        />
        <div className="flex-1 flex min-h-0 min-w-0">
          <GraphPane />
          <div
            className="w-1 shrink-0 cursor-col-resize hover:bg-accent/30 transition-colors bg-transparent"
            onMouseDown={handleInspectorDragStart}
          />
          <div style={{ width: inspectorWidth }} className="shrink-0 h-full">
            <Inspector />
          </div>
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

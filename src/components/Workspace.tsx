import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRepoStore } from '../stores/repo';
import { useStatus, useOpenRepo } from '../queries/useRepo';
import { useFetchAll } from '../queries/useMutations';
import { api } from '../ipc/api';
import { Sidebar } from './Sidebar';
import { MainContent } from './MainContent';
import { CommitSidebar } from './commit/CommitSidebar';
import { LogDrawer } from './LogDrawer';
import { TopBar } from './TopBar';
import { InProgressBanner } from './InProgressBanner';
import { CommandPalette } from './CommandPalette';
import { RepositorySearch } from './RepositorySearch';
import { PushRejectionBanner } from './PushRejectionBanner';
import { ErrorBoundary } from './ErrorBoundary';

export function Workspace({ onOpenSettings }: { onOpenSettings: () => void }) {
  const logDrawerOpen = useRepoStore((s) => s.logDrawerOpen);
  const sidebarCollapsed = useRepoStore((s) => s.sidebarCollapsed);
  const activePath = useRepoStore((s) => s.activeRepo?.path ?? 'none');
  const activeTab = useRepoStore((s) => s.tabs.find((tab) => tab.id === s.activeTabId) ?? null);
  const status = useStatus();
  const openRepo = useOpenRepo();

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const [sidebarWidth, setSidebarWidth] = useState(settings?.sidebarWidth ?? 256);
  const [inspectorWidth, setInspectorWidth] = useState(Math.max(settings?.inspectorWidth ?? 460, 420));

  useEffect(() => {
    if (settings?.sidebarWidth != null) setSidebarWidth(settings.sidebarWidth);
  }, [settings?.sidebarWidth]);

  useEffect(() => {
    if (settings?.inspectorWidth != null) setInspectorWidth(Math.max(settings.inspectorWidth, 420));
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
      const newWidth = Math.min(760, Math.max(340, startWidth - (ev.clientX - startX)));
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

  useEffect(() => {
    if (activeTab?.kind === 'repo' && !activeTab.loaded && !openRepo.isPending) {
      void openRepo.mutateAsync(activeTab.repoPath);
    }
  }, [activeTab, openRepo]);

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

  const fetchAll = useFetchAll();

  useEffect(() => {
    const interval = settings?.autoFetchInterval;
    if (!interval || interval <= 0) return;
    const timer = setInterval(() => {
      fetchAll.mutate(false);
    }, interval * 60 * 1000);
    return () => clearInterval(timer);
  }, [settings?.autoFetchInterval]);

  const handleOpenRepository = async () => {
    const path = await window.api.dialog.pickRepo();
    if (path) await openRepo.mutateAsync(path);
  };

  return (
    <div className="h-full flex flex-col bg-bg">
      <TopBar onOpenSettings={onOpenSettings} />
      {activeTab?.kind === 'repo' && <PushRejectionBanner />}
      {activeTab?.kind === 'repo' && status.data && status.data.states.length > 0 && (
        <InProgressBanner states={status.data.states} />
      )}
      <div className="flex-1 flex min-h-0 min-w-0">
        {activeTab?.kind === 'repo' && activeTab.loaded ? (
          <>
            <Sidebar sidebarWidth={sidebarWidth} />
            {!sidebarCollapsed && (
              <div
                className="w-1 shrink-0 cursor-col-resize hover:bg-accent/30 transition-colors bg-transparent"
                onMouseDown={handleSidebarDragStart}
              />
            )}
            <div className="flex-1 flex min-h-0 min-w-0">
              <ErrorBoundary key={`main:${activePath}`} title="Repository view crashed">
                <MainContent onOpenSettings={onOpenSettings} />
              </ErrorBoundary>
              <div
                className="w-1 shrink-0 cursor-col-resize hover:bg-accent/30 transition-colors bg-transparent"
                onMouseDown={handleInspectorDragStart}
              />
              <div style={{ width: inspectorWidth }} className="shrink-0 h-full min-w-0">
                <ErrorBoundary
                  key={`commit:${activePath}`}
                  title="Commit panel crashed"
                >
                  <CommitSidebar />
                </ErrorBoundary>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 min-h-0 min-w-0">
            <ErrorBoundary key={`main:${activePath}`} title="Repository view crashed">
              <MainContent onOpenSettings={onOpenSettings} />
            </ErrorBoundary>
          </div>
        )}
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

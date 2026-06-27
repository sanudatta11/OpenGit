// src/App.tsx — top-level shell. Shows LaunchPanel when no repos, Workspace when repos open.

import { useEffect, useState } from 'react';
import { useRepoStore } from './stores/repo';
import { useRehydrateRepos, useIpcRepoListener, usePersistTabSession } from './queries/useRepo';
import { useUpdaterEvents } from './queries/useUpdater';
import { Workspace } from './components/Workspace';
import { SettingsPanel } from './components/SettingsPanel';

export default function App() {
  const tabs = useRepoStore((s) => s.tabs);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Rehydrate open repos from main process on mount.
  useRehydrateRepos();
  usePersistTabSession();

  // Listen for repo open requests from CLI (second-instance).
  useIpcRepoListener();

  // Subscribe to auto-updater events -> toasts (no-op in dev).
  useUpdaterEvents();

  // Keyboard: Ctrl/Cmd+, opens settings.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {tabs.length > 0 && (
        <Workspace onOpenSettings={() => setSettingsOpen(true)} />
      )}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

// src/App.tsx — top-level shell. Decides between empty state and workspace.

import { useEffect, useState } from 'react';
import { useRepoStore } from './stores/repo';
import { useRepoHead } from './queries/useRepo';
import { Workspace } from './components/Workspace';
import { EmptyState } from './components/EmptyState';
import { SettingsPanel } from './components/SettingsPanel';

export default function App() {
  const repo = useRepoStore((s) => s.repo);
  const setRepo = useRepoStore((s) => s.setRepo);
  const head = useRepoHead();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Rehydrate repo info if the renderer reloads.
  useEffect(() => {
    if (head.data && !repo) setRepo(head.data);
  }, [head.data, repo, setRepo]);

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
      {!repo ? (
        <EmptyState onOpenSettings={() => setSettingsOpen(true)} />
      ) : (
        <Workspace onOpenSettings={() => setSettingsOpen(true)} />
      )}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}

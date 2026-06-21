import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import { useStatus } from '../../queries/useRepo';
import { useRepoStore } from '../../stores/repo';
import { PaneErrorState } from '../ErrorBoundary';
import { CommitComposer } from './CommitComposer';
import { CommitPanelHeader } from './CommitPanelHeader';
import { FileChanges } from './FileChanges';

const MIN_COMPOSER_HEIGHT = 210;
const MIN_FILE_HEIGHT = 180;

export function CommitSidebar() {
  const status = useStatus();
  const branch = useRepoStore((state) => state.activeRepo?.currentBranch ?? null);
  const containerRef = useRef<HTMLDivElement>(null);
  const composerHeightRef = useRef(240);
  const [containerHeight, setContainerHeight] = useState(0);
  const [composerHeight, setComposerHeight] = useState(240);
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() });

  useEffect(() => {
    if (settings.data?.commitPanelComposerHeight) setComposerHeight(settings.data.commitPanelComposerHeight);
  }, [settings.data?.commitPanelComposerHeight]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const update = () => setContainerHeight(element.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const maxComposerHeight = Math.max(MIN_COMPOSER_HEIGHT, containerHeight - MIN_FILE_HEIGHT);
  const clampedComposerHeight = Math.min(maxComposerHeight, Math.max(MIN_COMPOSER_HEIGHT, composerHeight));
  composerHeightRef.current = clampedComposerHeight;

  const startResize = (event: React.MouseEvent) => {
    event.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const move = (moveEvent: MouseEvent) => {
      setComposerHeight(Math.min(maxComposerHeight, Math.max(MIN_COMPOSER_HEIGHT, rect.bottom - moveEvent.clientY)));
    };
    const up = () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      void api.settings.set({ commitPanelComposerHeight: Math.round(composerHeightRef.current) });
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };

  if (status.isLoading && !status.data) return <div className="p-4 text-sm text-fg-muted">Loading changes…</div>;
  if (status.error) return <PaneErrorState title="Failed to load working tree" message={(status.error as Error).message} onRetry={() => void status.refetch()} />;
  if (!status.data) return null;

  const stagedCount = status.data.entries.filter((entry) => entry.staged && entry.kind !== 'unmerged').length;
  const hasConflicts = status.data.entries.some((entry) => entry.kind === 'unmerged');

  return (
    <aside ref={containerRef} id="commit-sidebar" className="h-full min-h-0 flex flex-col bg-bg-panel border-l border-border">
      <CommitPanelHeader entries={status.data.entries} branch={branch} />
      <FileChanges entries={status.data.entries} />
      <div className="commit-composer-resizer" title="Resize commit composer" onMouseDown={startResize} />
      <div className="shrink-0 min-h-0 overflow-hidden" style={{ height: clampedComposerHeight }}>
        <CommitComposer stagedCount={stagedCount} hasConflicts={hasConflicts} />
      </div>
    </aside>
  );
}

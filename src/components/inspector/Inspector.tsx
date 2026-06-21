// src/components/inspector/Inspector.tsx — hybrid inspector: persistent working tree + contextual lower pane.

import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import { useRepoStore, getCachedCommit } from '../../stores/repo';
import { useStatus } from '../../queries/useRepo';
import { CommitDetails, CommitFileDiff } from './CommitDetails';
import { WorkingTree, WorkingTreeDiff } from './WorkingTree';
import { OperationPreviewPanel } from './OperationPreviewPanel';
import { ConflictEditor } from './ConflictEditor';
import { BranchCompare } from '../compare/BranchCompare';
import { BlameView } from './BlameView';
import { ErrorBoundary } from '../ErrorBoundary';

type ContextTab = 'details' | 'compare' | 'actions';

export function Inspector() {
  const activeRepoPath = useRepoStore((s) => s.activeRepo?.path ?? null);
  const selectedSha = useRepoStore((s) => s.selectedCommitSha);
  const selectedFile = useRepoStore((s) => s.selectedFile);
  const status = useStatus();
  const selectFile = useRepoStore((s) => s.selectFile);
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const [contextTab, setContextTab] = useState<ContextTab>('details');
  const [diffView, setDiffView] = useState<'side-by-side' | 'unified'>('side-by-side');
  const [blameActive, setBlameActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const [topPaneHeight, setTopPaneHeight] = useState(Math.max(settings?.inspectorTopHeight ?? 320, 240));
  const topPaneHeightRef = useRef(topPaneHeight);
  topPaneHeightRef.current = topPaneHeight;

  useEffect(() => {
    if (settings?.inspectorTopHeight != null) {
      setTopPaneHeight(Math.max(settings.inspectorTopHeight, 240));
    }
  }, [settings?.inspectorTopHeight]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateHeight = () => setContainerHeight(element.clientHeight);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setContextTab('details');
    setDiffView('side-by-side');
    setBlameActive(false);
    selectFile(null);
    selectCommit(null);
  }, [activeRepoPath, selectCommit, selectFile]);

  const commit = activeRepoPath && selectedSha ? getCachedCommit(activeRepoPath, selectedSha) : undefined;
  const hasConflicts = (status.data?.entries ?? []).some((e) => e.kind === 'unmerged');
  const minTopPaneHeight = 220;
  const minBottomPaneHeight = 220;
  const maxTopPaneHeight = containerHeight > 0
    ? Math.max(minTopPaneHeight, containerHeight - minBottomPaneHeight)
    : 520;
  const clampedTopPaneHeight = Math.min(
    Math.max(minTopPaneHeight, topPaneHeight),
    maxTopPaneHeight,
  );
  topPaneHeightRef.current = clampedTopPaneHeight;

  useEffect(() => {
    if (topPaneHeight !== clampedTopPaneHeight) {
      setTopPaneHeight(clampedTopPaneHeight);
    }
  }, [clampedTopPaneHeight, topPaneHeight]);

  const handleTopPaneDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const handleMouseMove = (ev: MouseEvent) => {
      const nextHeight = ev.clientY - rect.top;
      const clampedHeight = Math.min(
        Math.max(minTopPaneHeight, nextHeight),
        Math.max(minTopPaneHeight, rect.height - minBottomPaneHeight),
      );
      setTopPaneHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      api.settings.set({ inspectorTopHeight: Math.round(topPaneHeightRef.current) });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const tabs = [
    { id: 'details', label: 'Details' },
    { id: 'compare', label: 'Compare' },
    { id: 'actions', label: 'Actions' },
  ] as const;

  return (
    <div
      ref={containerRef}
      className="h-full border-l border-border bg-bg-panel shrink-0 flex flex-col min-h-0 text-xs w-full"
    >
      <div
        style={{ height: clampedTopPaneHeight }}
        className="min-h-[220px] min-w-0 border-b border-border overflow-hidden shrink-0"
      >
        <WorkingTree />
      </div>
      <div
        className="h-1 shrink-0 cursor-row-resize hover:bg-accent/30 transition-colors bg-transparent"
        onMouseDown={handleTopPaneDragStart}
      />
      <div className="flex border-b border-border bg-bg/25 shrink-0 select-none">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors ${
              contextTab === t.id
                ? 'border-accent text-accent bg-accent/5'
                : 'border-transparent text-fg-muted hover:text-fg hover:bg-bg-hover/30'
            }`}
            onClick={() => setContextTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0 flex flex-col">
        {contextTab === 'compare' ? <BranchCompare /> : contextTab === 'actions' ? (
          hasConflicts ? <ConflictEditor /> : <OperationPreviewPanel />
        ) : (
          <ErrorBoundary title="Details pane crashed">
            <div className="flex-1 min-h-0 flex flex-col">
              {selectedFile ? (
                <>
                  <div className="h-8 px-3 flex items-center gap-2 border-b border-border shrink-0 bg-bg/10">
                    <span className="text-xs text-fg truncate flex-1 font-mono">{selectedFile.path}</span>
                    <div className="flex items-center gap-1">
                      <button
                        className={`text-xxs px-1.5 py-0.5 rounded ${!blameActive && diffView === 'side-by-side' ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:bg-bg-hover'}`}
                        onClick={() => { setDiffView('side-by-side'); setBlameActive(false); }}
                      >
                        Split
                      </button>
                      <button
                        className={`text-xxs px-1.5 py-0.5 rounded ${!blameActive && diffView === 'unified' ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:bg-bg-hover'}`}
                        onClick={() => { setDiffView('unified'); setBlameActive(false); }}
                      >
                        Unified
                      </button>
                      <button
                        className={`text-xxs px-1.5 py-0.5 rounded ${blameActive ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:bg-bg-hover'}`}
                        onClick={() => setBlameActive(!blameActive)}
                      >
                        Blame
                      </button>
                      <button
                        className="text-xxs px-1.5 py-0.5 rounded text-fg-muted hover:bg-bg-hover"
                        onClick={() => selectFile(null)}
                      >
                        Close
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    {blameActive ? (
                      <BlameView path={selectedFile.path} ref={selectedFile.sha} />
                    ) : selectedFile.isCommit ? (
                      commit ? (
                        <CommitFileDiff commit={commit} file={selectedFile as any} view={diffView} />
                      ) : null
                    ) : (
                      <WorkingTreeDiff entry={selectedFile as any} view={diffView} />
                    )}
                  </div>
                </>
              ) : commit ? (
                <CommitDetails commit={commit} />
              ) : (
                <div className="flex-1 flex items-center justify-center p-4 text-center text-fg-dim">
                  Select a file from the working tree or click a commit in the graph to inspect details.
                </div>
              )}
            </div>
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}

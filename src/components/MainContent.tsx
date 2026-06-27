import { useState } from 'react';
import { ArrowLeft, GitCompare, ListTree, X } from 'lucide-react';
import { GraphPane } from './graph/GraphPane';
import { BranchCompare } from './compare/BranchCompare';
import { CommitDetails } from './inspector/CommitDetails';
import { ConflictEditor } from './inspector/ConflictEditor';
import { OperationPreviewPanel } from './inspector/OperationPreviewPanel';
import { DiffViewer, type DiffView } from './diff/DiffViewer';
import { PaneErrorState } from './ErrorBoundary';
import { useFileContent, useStatus } from '../queries/useRepo';
import { getCachedCommit, useRepoStore } from '../stores/repo';
import { languageForFile } from '../monaco/language';
import { LaunchPanel } from './LaunchPanel';

export function MainContent({ onOpenSettings }: { onOpenSettings: () => void }) {
  const view = useRepoStore((state) => state.mainView);
  const activePath = useRepoStore((state) => state.activeRepo?.path ?? null);
  const activeTab = useRepoStore((state) => state.tabs.find((tab) => tab.id === state.activeTabId) ?? null);
  const showGraph = useRepoStore((state) => state.showGraph);
  const setMainView = useRepoStore((state) => state.setMainView);
  const status = useStatus();
  const hasConflicts = (status.data?.entries ?? []).some((entry) => entry.kind === 'unmerged');
  const commit = activePath && (view.kind === 'commit-details' || view.kind === 'commit-file-diff')
    ? getCachedCommit(activePath, view.sha)
    : undefined;

  if (activeTab?.kind === 'dashboard' || !activePath) {
    return <LaunchPanel onOpenSettings={onOpenSettings} />;
  }

  return (
    <div className="relative flex-1 min-h-0 min-w-0 bg-bg">
      <div className={`absolute inset-0 min-h-0 min-w-0 ${view.kind === 'graph' ? 'flex' : 'invisible pointer-events-none'}`}>
        <GraphPane />
      </div>
      {view.kind !== 'graph' && (
        <div className="absolute inset-0 flex flex-col min-h-0 min-w-0 bg-bg">
          <div className="h-10 shrink-0 border-b border-border bg-bg-panel/95 px-3 flex items-center gap-2">
            <button className="btn !px-2 !py-1" onClick={showGraph}>
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to graph
            </button>
            <div className="h-4 w-px bg-border" />
            <button
              className={`btn !px-2 !py-1 ${view.kind === 'compare' ? 'text-accent border-accent/40' : ''}`}
              onClick={() => setMainView({ kind: 'compare' })}
            >
              <GitCompare className="w-3.5 h-3.5" />
              Compare
            </button>
            <button
              className={`btn !px-2 !py-1 ${view.kind === 'operation-actions' ? 'text-accent border-accent/40' : ''}`}
              onClick={() => setMainView({ kind: 'operation-actions' })}
            >
              <ListTree className="w-3.5 h-3.5" />
              Actions
            </button>
          </div>
          <div className="flex-1 min-h-0 min-w-0">
            {view.kind === 'working-tree-diff' ? (
              <WorkingTreeDiffContent path={view.path} source={view.source} />
            ) : view.kind === 'compare' ? (
              <BranchCompare />
            ) : view.kind === 'operation-actions' ? (
              hasConflicts ? <ConflictEditor /> : <OperationPreviewPanel />
            ) : commit ? (
              <CommitDetails commit={commit} />
            ) : (
              <PaneErrorState title="Commit unavailable" message="The selected commit is no longer in the active repository cache." onRetry={showGraph} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkingTreeDiffContent({ path, source }: { path: string; source: 'staged' | 'unstaged' }) {
  const [diffView, setDiffView] = useState<DiffView>('side-by-side');
  const showGraph = useRepoStore((state) => state.showGraph);
  const original = useFileContent({ path, ref: source === 'staged' ? 'HEAD' : 'INDEX' });
  const modified = useFileContent(source === 'staged' ? { path, ref: 'INDEX' } : { path });
  const error = original.error || modified.error;

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="h-9 shrink-0 px-3 border-b border-border bg-bg/20 flex items-center gap-3">
        <span className="font-mono text-xs text-fg truncate flex-1">{path}</span>
        <span className="text-[10px] uppercase tracking-wider text-fg-dim">{source}</span>
        <button className={`text-xs px-2 py-1 rounded ${diffView === 'side-by-side' ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-bg-hover'}`} onClick={() => setDiffView('side-by-side')}>Split</button>
        <button className={`text-xs px-2 py-1 rounded ${diffView === 'unified' ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:bg-bg-hover'}`} onClick={() => setDiffView('unified')}>Unified</button>
        <div className="h-4 w-px bg-border mx-0.5" />
        <button
          className="icon-btn hover:text-fg"
          onClick={showGraph}
          title="Close diff"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {original.isLoading || modified.isLoading ? (
          <div className="h-full grid place-items-center text-sm text-fg-muted">Loading diff…</div>
        ) : error ? (
          <PaneErrorState title="Failed to load working tree diff" message={(error as Error).message} />
        ) : (
          <DiffViewer
            original={original.data?.content ?? ''}
            modified={modified.data?.content ?? ''}
            binary={original.data?.isBinary || modified.data?.isBinary}
            language={languageForFile(path)}
            view={diffView}
          />
        )}
      </div>
    </div>
  );
}

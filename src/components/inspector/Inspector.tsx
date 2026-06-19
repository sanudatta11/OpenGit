// src/components/inspector/Inspector.tsx — right pane: commit details or working-tree editor with 4 tabs.

import { useState, useEffect } from 'react';
import { useRepoStore, getCachedCommit } from '../../stores/repo';
import { useStatus } from '../../queries/useRepo';
import { CommitDetails, CommitFileDiff } from './CommitDetails';
import { WorkingTree, WorkingTreeDiff } from './WorkingTree';
import { OperationPreviewPanel } from './OperationPreviewPanel';
import { ConflictEditor } from './ConflictEditor';
import { BranchCompare } from '../compare/BranchCompare';
import { BlameView } from './BlameView';

type Tab = 'changes' | 'details' | 'diff' | 'actions' | 'compare';

export function Inspector() {
  const selectedSha = useRepoStore((s) => s.selectedCommitSha);
  const selectedFile = useRepoStore((s) => s.selectedFile);
  const status = useStatus();

  const [activeTab, setActiveTab] = useState<Tab>('changes');
  const [diffView, setDiffView] = useState<'side-by-side' | 'unified'>('side-by-side');
  const [blameActive, setBlameActive] = useState(false);

  // Automatically switch tabs when selections change
  useEffect(() => {
    if (selectedFile) {
      setActiveTab('diff');
    }
  }, [selectedFile]);

  useEffect(() => {
    if (selectedSha) {
      setActiveTab('details');
    } else {
      setActiveTab('changes');
    }
  }, [selectedSha]);

  const commit = selectedSha ? getCachedCommit(selectedSha) : undefined;
  const hasConflicts = (status.data?.entries ?? []).some((e) => e.kind === 'unmerged');

  const tabs = [
    { id: 'changes', label: 'Changes' },
    { id: 'details', label: 'Details' },
    { id: 'diff', label: 'Diff' },
    { id: 'compare', label: 'Compare' },
    { id: 'actions', label: 'Actions' },
  ] as const;

  return (
    <div className="h-full border-l border-border bg-bg-panel shrink-0 flex flex-col min-h-0 text-xs w-full">
      {/* Tabs Header */}
      <div className="flex border-b border-border bg-bg/25 shrink-0 select-none">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`flex-1 py-2 text-center font-medium border-b-2 transition-colors ${
              activeTab === t.id
                ? 'border-accent text-accent bg-accent/5'
                : 'border-transparent text-fg-muted hover:text-fg hover:bg-bg-hover/30'
            }`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === 'changes' && <WorkingTree />}
        {activeTab === 'details' && (
          commit ? <CommitDetails commit={commit} /> : (
            <div className="p-4 text-center text-fg-dim">No commit selected. Click a commit in the graph to view details.</div>
          )
        )}
        {activeTab === 'diff' && (
          selectedFile ? (
            <div className="flex-1 flex flex-col min-h-0">
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
            </div>
          ) : (
            <div className="p-4 text-center text-fg-dim">No file selected. Select a file in the Changes or Details tab to view its diff.</div>
          )
        )}
        {activeTab === 'compare' && <BranchCompare />}
        {activeTab === 'actions' && (
          hasConflicts ? <ConflictEditor /> : <OperationPreviewPanel />
        )}
      </div>
    </div>
  );
}

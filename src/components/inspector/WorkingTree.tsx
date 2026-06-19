// src/components/inspector/WorkingTree.tsx — staged/unstaged file list + actions + commit form + diff.

import { useState, useEffect } from 'react';
import {
  FileEdit, FilePlus, FileMinus, FileOutput, AlertCircle, Check, ChevronRight,
  Plus, Minus, RotateCcw, Loader2,
} from 'lucide-react';
import { useStatus, useFileContent, useBranches, useLog } from '../../queries/useRepo';
import {
  useStage, useStageAll, useUnstage, useUnstageAll, useDiscard, useCommit, usePush,
} from '../../queries/useMutations';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import type { StatusEntry, EntryKind } from '@shared/git';
import { DiffViewer } from '../diff/DiffViewer';
import { languageForFile } from '../../monaco/language';
import type { DiffView } from '../diff/DiffViewer';
import { ConfirmDialog } from '../ConfirmDialog';
import { HunkStagingView } from './HunkStagingView';
import { useRepoStore } from '../../stores/repo';

export function WorkingTree() {
  const status = useStatus();
  const [selectedEntry, setSelectedEntry] = useState<StatusEntry | null>(null);
  const [diffView, setDiffView] = useState<DiffView | 'hunks'>('side-by-side');
  const [confirmEntry, setConfirmEntry] = useState<StatusEntry | null>(null);
  const discard = useDiscard();
  const stage = useStage();
  const unstage = useUnstage();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const branchName = useRepoStore((s) => s.activeRepo)?.currentBranch ?? 'HEAD';

  const toggleFile = (path: string) => {
    setSelectedFiles(prev => { const n = new Set(prev); if (n.has(path)) n.delete(path); else n.add(path); return n; });
  };

  const allEntries = status.data?.entries ?? [];
  const selectedEntries = allEntries.filter(e => selectedFiles.has(e.path));

  const handleStageSelected = () => {
    const unstaged = selectedEntries.filter(e => !e.staged);
    if (unstaged.length) stage.mutate(unstaged.map(e => e.path), { onSuccess: () => setSelectedFiles(new Set()) });
  };

  const handleDiscardSelected = () => {
    const tracked = selectedEntries.filter(e => e.kind !== 'untracked');
    const untracked = selectedEntries.filter(e => e.kind === 'untracked');
    if (tracked.length) discard.mutate({ paths: tracked.map(e => e.path) });
    if (untracked.length) discard.mutate({ paths: untracked.map(e => e.path), untracked: true });
    setSelectedFiles(new Set());
  };

  if (status.isLoading && !status.data) {
    return <div className="p-3 text-xs text-fg-muted">Loading status…</div>;
  }
  if (status.error) {
    return <div className="p-3 text-xs text-git-deleted">{(status.error as Error).message}</div>;
  }
  if (!status.data) return null;

  if (status.data.isClean && !selectedEntry) {
    return (
      <div className="p-3 text-xs text-fg-muted flex items-center gap-2">
        <Check className="w-4 h-4 text-git-added" />
        Working tree clean.
      </div>
    );
  }

  const staged = status.data.entries.filter((e) => e.staged);
  const unstaged = status.data.entries.filter((e) => e.unstaged);
  const untracked = status.data.entries.filter((e) => e.kind === 'untracked');
  const conflicts = status.data.entries.filter((e) => e.kind === 'unmerged');

  return (
    <div className="flex flex-col h-full min-h-0">
      {!selectedEntry && (
        <>
          <div className="px-3 py-2 border-b border-border bg-bg/25 text-xs text-fg-muted flex items-center gap-3 shrink-0">
            <span className="text-fg font-medium">WIP on <span className="text-git-branch">{branchName}</span></span>
            <span className="text-fg-dim">|</span>
            <span className="text-git-staged">{staged.length} staged</span>
            <span className="text-git-modified">{unstaged.length} unstaged</span>
            {untracked.length > 0 && <span className="text-git-untracked">{untracked.length} untracked</span>}
          </div>
          {conflicts.length > 0 && (
            <Section title="Conflicts" count={conflicts.length} color="text-git-conflicted" entries={conflicts} onSelect={setSelectedEntry} selected={selectedEntry} onDiscard={setConfirmEntry} selectedFiles={selectedFiles} onToggleFile={toggleFile} />
          )}
          <Section
            title="Staged" count={staged.length} color="text-git-staged"
            entries={staged} onSelect={setSelectedEntry} selected={selectedEntry}
            actions={staged.length > 0 ? <UnstageAllButton /> : undefined}
            onDiscard={setConfirmEntry}
            selectedFiles={selectedFiles} onToggleFile={toggleFile}
          />
          <Section
            title="Unstaged" count={unstaged.length} color="text-git-modified"
            entries={unstaged} onSelect={setSelectedEntry} selected={selectedEntry}
            actions={unstaged.length > 0 ? <StageAllButton /> : undefined}
            onDiscard={setConfirmEntry}
            selectedFiles={selectedFiles} onToggleFile={toggleFile}
          />
          {untracked.length > 0 && (
            <Section title="Untracked" count={untracked.length} color="text-git-untracked" entries={untracked} onSelect={setSelectedEntry} selected={selectedEntry} onDiscard={setConfirmEntry} selectedFiles={selectedFiles} onToggleFile={toggleFile} />
          )}
          {selectedFiles.size >= 2 && (
            <div className="px-3 py-2 border-t border-border bg-accent/5 flex items-center gap-2 text-xs shrink-0">
              <span className="text-fg-muted">{selectedFiles.size} selected</span>
              <button className="btn btn-primary !text-xs !px-2 !py-0.5" onClick={handleStageSelected} disabled={stage.isPending || unstage.isPending}>
                Stage selected
              </button>
              <button className="btn !text-xs !px-2 !py-0.5" onClick={handleDiscardSelected}>Discard selected</button>
              <button className="btn !text-xs !px-2 !py-0.5" onClick={() => setSelectedFiles(new Set())}>Clear</button>
            </div>
          )}
          <CommitForm />
        </>
      )}
      {selectedEntry && (
        <>
          <div className="h-8 px-3 flex items-center gap-2 border-b border-border shrink-0">
            <button className="icon-btn" onClick={() => { setSelectedEntry(null); useRepoStore.getState().selectFile(null); }} title="Back">
              <ChevronRight className="w-3 h-3 rotate-180" />
            </button>
            <span className="text-xs text-fg truncate flex-1 font-mono">{selectedEntry.path}</span>
            <div className="flex items-center gap-1">
              <button
                className={`text-xxs px-1.5 py-0.5 rounded ${diffView === 'side-by-side' ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:bg-bg-hover'}`}
                onClick={() => setDiffView('side-by-side')}
              >
                Split
              </button>
              <button
                className={`text-xxs px-1.5 py-0.5 rounded ${diffView === 'unified' ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:bg-bg-hover'}`}
                onClick={() => setDiffView('unified')}
              >
                Unified
              </button>
              <button
                className={`text-xxs px-1.5 py-0.5 rounded ${diffView === 'hunks' ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:bg-bg-hover'}`}
                onClick={() => setDiffView('hunks')}
              >
                Hunks
              </button>
            </div>
          </div>
          {diffView === 'hunks' ? (
            <HunkStagingView path={selectedEntry.path} staged={selectedEntry.staged} />
          ) : (
            <WorkingTreeDiff entry={selectedEntry} view={diffView as DiffView} />
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmEntry}
        title="Discard changes?"
        message={
          confirmEntry?.kind === 'untracked'
            ? `Delete the untracked file "${confirmEntry?.path}"? This cannot be undone.`
            : `Discard changes to "${confirmEntry?.path}"? This cannot be undone.`
        }
        confirmLabel={confirmEntry?.kind === 'untracked' ? 'Delete file' : 'Discard'}
        danger
        onConfirm={() => {
          if (confirmEntry) {
            void discard.mutate({
              paths: [confirmEntry.path],
              untracked: confirmEntry.kind === 'untracked',
            });
            setConfirmEntry(null);
          }
        }}
        onCancel={() => setConfirmEntry(null)}
      />
    </div>
  );
}

function StageAllButton() {
  const stageAll = useStageAll();
  return (
    <button
      className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded text-git-added hover:bg-git-added/10"
      onClick={() => stageAll.mutate()}
      disabled={stageAll.isPending}
      title="Stage all"
    >
      {stageAll.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
      All
    </button>
  );
}

function UnstageAllButton() {
  const unstageAll = useUnstageAll();
  return (
    <button
      className="text-xs flex items-center gap-1 px-1.5 py-0.5 rounded text-git-modified hover:bg-git-modified/10"
      onClick={() => unstageAll.mutate()}
      disabled={unstageAll.isPending}
      title="Unstage all"
    >
      {unstageAll.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Minus className="w-3 h-3" />}
      All
    </button>
  );
}

function Section({
  title,
  count,
  color,
  entries,
  onSelect,
  selected,
  actions,
  onDiscard,
  selectedFiles,
  onToggleFile,
}: {
  title: string;
  count: number;
  color: string;
  entries: StatusEntry[];
  onSelect: (e: StatusEntry) => void;
  selected: StatusEntry | null;
  actions?: React.ReactNode;
  onDiscard: (e: StatusEntry) => void;
  selectedFiles: Set<string>;
  onToggleFile: (path: string) => void;
}) {
  if (count === 0) return null;
  return (
    <div className="border-b border-border-subtle shrink-0">
      <div className="px-3 py-1.5 flex items-center justify-between">
        <span className={`label ${color}`}>{title}</span>
        <div className="flex items-center gap-1">
          {actions}
          <span className="text-xxs text-fg-dim">{count}</span>
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {entries.map((e) => (
          <FileRow
            key={`${e.path}:${e.oldPath ?? ''}`}
            entry={e}
            selected={selected?.path === e.path}
            onClick={() => onSelect(e)}
            onDiscard={() => onDiscard(e)}
            checked={selectedFiles.has(e.path)}
            onToggle={() => onToggleFile(e.path)}
          />
        ))}
      </div>
    </div>
  );
}

const KIND_ICON: Record<EntryKind, typeof FileEdit> = {
  modified: FileEdit,
  added: FilePlus,
  deleted: FileMinus,
  renamed: FileOutput,
  copied: FileOutput,
  unmerged: AlertCircle,
  untracked: FilePlus,
  ignored: FileEdit,
};

const KIND_COLOR: Record<EntryKind, string> = {
  modified: 'text-git-modified',
  added: 'text-git-added',
  deleted: 'text-git-deleted',
  renamed: 'text-git-renamed',
  copied: 'text-git-renamed',
  unmerged: 'text-git-conflicted',
  untracked: 'text-git-untracked',
  ignored: 'text-fg-dim',
};

function FileRow({ entry, selected, onClick, onDiscard, checked, onToggle }: { entry: StatusEntry; selected: boolean; onClick: () => void; onDiscard: () => void; checked: boolean; onToggle: () => void }) {
  const stage = useStage();
  const unstage = useUnstage();

  const label = entry.oldPath ? `${entry.oldPath} → ${entry.path}` : entry.path;
  const Icon = KIND_ICON[entry.kind];
  const color = KIND_COLOR[entry.kind];

  const handleStage = (e: React.MouseEvent) => {
    e.stopPropagation();
    void stage.mutate([entry.path]);
  };
  const handleUnstage = (e: React.MouseEvent) => {
    e.stopPropagation();
    void unstage.mutate([entry.path]);
  };
  const handleDiscard = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDiscard();
  };

  const handleClick = () => {
    onClick();
    useRepoStore.getState().selectFile({
      path: entry.path,
      staged: entry.staged,
      isCommit: false,
      oldPath: entry.oldPath,
    });
  };

  const showStage = !entry.staged;
  const showUnstage = entry.staged;
  const showDiscard = entry.unstaged || entry.kind === 'untracked';

  return (
    <div
      className={`w-full text-left px-3 py-1 flex items-center gap-2 ${selected ? 'bg-accent/10' : 'row-hover'}`}
      title={entry.path}
      onClick={handleClick}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} onClick={e => e.stopPropagation()} className="accent-accent shrink-0" />
      <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
      <span className="text-xs truncate flex-1">{label}</span>
      <div className="flex items-center gap-0.5 shrink-0">
        {showStage && (
          <button
            className="icon-btn !w-6 !h-6"
            onClick={handleStage}
            disabled={stage.isPending}
            title="Stage"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
        {showUnstage && (
          <button
            className="icon-btn !w-6 !h-6"
            onClick={handleUnstage}
            disabled={unstage.isPending}
            title="Unstage"
          >
            <Minus className="w-3 h-3" />
          </button>
        )}
        {showDiscard && (
          <button
            className="icon-btn !w-6 !h-6 hover:text-git-deleted"
            onClick={handleDiscard}
            title="Discard"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}

export function WorkingTreeDiff({ entry, view }: { entry: StatusEntry; view: DiffView }) {
  const headContent = useFileContent({ path: entry.oldPath ?? entry.path, ref: 'HEAD' });
  const worktreeContent = useFileContent({ path: entry.path });

  const loading = headContent.isLoading || worktreeContent.isLoading;
  const error = headContent.error || worktreeContent.error;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-fg-muted">Loading diff…</div>;
  }
  if (error) {
    return <div className="flex-1 flex items-center justify-center text-xs text-git-deleted">{(error as Error).message}</div>;
  }

  const original = headContent.data?.content ?? '';
  const modified = worktreeContent.data?.content ?? '';
  const isBinary = headContent.data?.isBinary || worktreeContent.data?.isBinary;

  return (
    <div className="flex-1 min-h-0">
      <DiffViewer
        original={original}
        modified={modified}
        language={languageForFile(entry.path)}
        view={view}
        binary={isBinary}
      />
    </div>
  );
}

function CommitForm() {
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [signCommit, setSignCommit] = useState(false);
  const [noVerify, setNoVerify] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [pushAfterCommit, setPushAfterCommit] = useState(false);
  const commit = useCommit();
  const push = usePush();
  const branches = useBranches();
  const headCommit = useLog(undefined, 0, 1);
  const status = useStatus();
  const hasStaged = (status.data?.entries ?? []).some((e) => e.staged);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  const subjectLine = message.split('\n')[0] ?? '';
  const subjectLength = subjectLine.length;
  const maxSubject = settings?.commitSubjectLength ?? 72;

  useEffect(() => {
    if (amend && headCommit.data?.commits[0]) {
      setMessage(headCommit.data.commits[0].subject);
    } else if (!amend) {
      setMessage('');
    }
  }, [amend]);

  const handleCommit = () => {
    if (!message.trim()) return;
    void commit.mutate(
      { message: message.trim(), amend, signoff: signCommit, noVerify },
      {
        onSuccess: () => {
          setMessage('');
          setAmend(false);
          setSignCommit(false);
          setNoVerify(false);
          setShowOptions(false);
          setPushAfterCommit(false);
          if (pushAfterCommit) {
            const currentBranch = branches.data?.find((b) => b.isHead);
            const upstreamBranch = currentBranch?.upstream;
            const remote = upstreamBranch?.split('/')[0] ?? 'origin';
            const pushBranch = upstreamBranch?.split('/').slice(1).join('/') ?? currentBranch?.shortName ?? '';
            push.mutate({ remote, branch: pushBranch, setUpstream: !upstreamBranch });
          }
        },
      },
    );
  };

  return (
    <div className="mt-auto p-3 border-t border-border shrink-0">
      <textarea
        className="input w-full h-20 resize-none font-sans"
        placeholder="Commit message (Ctrl+Enter to commit)…"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleCommit();
          }
        }}
        disabled={commit.isPending}
        spellCheck
      />
      <div className={`text-xs text-right ${subjectLength > maxSubject ? 'text-git-deleted' : 'text-fg-dim'}`}>
        {subjectLength}/{maxSubject}
      </div>
      {amend && headCommit.data?.commits[0] && (
        <div className="text-xs text-fg-muted mb-1">Amending: {headCommit.data.commits[0].sha.slice(0, 7)}</div>
      )}
      <div className="flex items-center justify-between mt-2">
        <button className="flex items-center gap-1 text-xs text-fg-muted hover:text-fg py-1" onClick={() => setShowOptions(!showOptions)}>
          <ChevronRight className={`w-3 h-3 transition-transform ${showOptions ? 'rotate-90' : ''}`} />
          Commit options
        </button>
        <button
          className="btn btn-primary"
          onClick={handleCommit}
          disabled={commit.isPending || !message.trim() || (!hasStaged && !amend)}
          title={(!hasStaged && !amend) ? 'Nothing staged to commit' : 'Commit (Ctrl+Enter)'}
        >
          {commit.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Commit
        </button>
      </div>
      {showOptions && (
        <div className="flex flex-col gap-1.5 pl-5 mb-2">
          <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
            <input
              type="checkbox"
              checked={amend}
              onChange={(e) => setAmend(e.target.checked)}
              className="accent-accent"
            />
            Amend
          </label>
          <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
            <input
              type="checkbox"
              checked={noVerify}
              onChange={(e) => setNoVerify(e.target.checked)}
              className="accent-accent"
            />
            No verify
          </label>
          <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
            <input
              type="checkbox"
              checked={signCommit}
              onChange={(e) => setSignCommit(e.target.checked)}
              className="accent-accent"
            />
            Sign with GPG/SSH
          </label>
          <label className="flex items-center gap-1.5 text-xs text-fg-muted cursor-pointer">
            <input type="checkbox" checked={pushAfterCommit} onChange={(e) => setPushAfterCommit(e.target.checked)} className="accent-accent" />
            Push after committing
          </label>
        </div>
      )}
      {commit.error && (
        <div className="mt-2 text-xs text-git-deleted">{(commit.error as Error).message}</div>
      )}
    </div>
  );
}

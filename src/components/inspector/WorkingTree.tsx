// src/components/inspector/WorkingTree.tsx — staged/unstaged file list + actions + commit form + diff.

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  FileEdit, FilePlus, FileMinus, FileOutput, AlertCircle, ChevronRight,
  Plus, Minus, RotateCcw, Loader2, CornerDownRight,
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
import { useRepoStore } from '../../stores/repo';
import { PaneErrorState } from '../ErrorBoundary';

export function WorkingTree() {
  const status = useStatus();
  const [confirmEntry, setConfirmEntry] = useState<StatusEntry | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    entry: StatusEntry;
  } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, entry: StatusEntry) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      entry,
    });
  };
  const discard = useDiscard();
  const branchName = useRepoStore((s) => s.activeRepo)?.currentBranch ?? 'HEAD';
  const selectedFile = useRepoStore((s) => s.selectedFile);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const [composerHeight, setComposerHeight] = useState(Math.max(settings?.inspectorComposerHeight ?? 210, 140));
  const composerHeightRef = useRef(composerHeight);
  composerHeightRef.current = composerHeight;

  const [stagedHeight, setStagedHeight] = useState(180);

  const handleSplitterDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = stagedHeight;

    const handleMouseMove = (ev: MouseEvent) => {
      const deltaY = ev.clientY - startY;
      const nextHeight = Math.max(60, startHeight + deltaY);
      setStagedHeight(nextHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    if (settings?.inspectorComposerHeight != null) {
      setComposerHeight(Math.max(settings.inspectorComposerHeight, 140));
    }
  }, [settings?.inspectorComposerHeight]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const updateHeight = () => setContainerHeight(element.clientHeight);
    updateHeight();

    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const minWorkspaceHeight = 180;
  const minComposerHeight = 140;
  const maxComposerHeight = containerHeight > 0
    ? Math.max(minComposerHeight, containerHeight - minWorkspaceHeight)
    : 420;
  const clampedComposerHeight = Math.min(
    Math.max(minComposerHeight, composerHeight),
    maxComposerHeight,
  );
  composerHeightRef.current = clampedComposerHeight;

  useEffect(() => {
    if (composerHeight !== clampedComposerHeight) {
      setComposerHeight(clampedComposerHeight);
    }
  }, [clampedComposerHeight, composerHeight]);

  if (status.isLoading && !status.data) {
    return <div className="p-3 text-xs text-fg-muted">Loading status…</div>;
  }
  if (status.error) {
    return <PaneErrorState title="Failed to load working tree" message={(status.error as Error).message} onRetry={() => void status.refetch()} />;
  }
  if (!status.data) return null;

  const staged = status.data.entries.filter((e) => e.staged);
  const unstaged = status.data.entries.filter((e) => e.unstaged);
  const untracked = status.data.entries.filter((e) => e.kind === 'untracked');
  const conflicts = status.data.entries.filter((e) => e.kind === 'unmerged');

  const handleComposerDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const handleMouseMove = (ev: MouseEvent) => {
      const nextHeight = rect.bottom - ev.clientY;
      const clampedHeight = Math.min(
        Math.max(minComposerHeight, nextHeight),
        Math.max(minComposerHeight, rect.height - minWorkspaceHeight),
      );
      setComposerHeight(clampedHeight);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      api.settings.set({ inspectorComposerHeight: Math.round(composerHeightRef.current) });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div ref={containerRef} className="flex flex-col h-full min-h-0 bg-bg-panel">
      <div className="px-3 py-2 border-b border-border bg-bg/20 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] text-fg font-medium truncate">
              Working tree on <span className="text-git-branch">{branchName}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-fg-muted shrink-0">
            <WorkspaceStat tone="staged" value={staged.length} label="staged" />
            <WorkspaceStat tone="unstaged" value={unstaged.length} label="unstaged" />
            {untracked.length > 0 && <WorkspaceStat tone="untracked" value={untracked.length} label="untracked" />}
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col px-2 py-1.5 overflow-hidden">
        {conflicts.length > 0 && (
          <Section
            title="Conflicts"
            count={conflicts.length}
            tone="conflicted"
            entries={conflicts}
            selectedPath={selectedFile?.path ?? null}
            onDiscard={setConfirmEntry}
            onContextMenu={handleContextMenu}
            listClassName="max-h-32"
          />
        )}
        <div style={{ height: stagedHeight }} className="shrink-0 flex flex-col min-h-[60px]">
          <Section
            title="Staged Files" count={staged.length} tone="staged"
            entries={staged}
            selectedPath={selectedFile?.path ?? null}
            actions={staged.length > 0 ? <UnstageAllButton prominent /> : undefined}
            onDiscard={setConfirmEntry}
            onContextMenu={handleContextMenu}
            emptyMessage="No staged files"
            emptyHint="Stage files from the sections below to prepare your next commit."
            fill
          />
        </div>
        <div
          className="h-1 hover:h-1.5 bg-border/40 hover:bg-accent/40 cursor-row-resize transition-all shrink-0 rounded-sm my-0.5"
          onMouseDown={handleSplitterDragStart}
          title="Drag to resize Staged / Unstaged split"
        />
        <div className="flex-1 min-h-0 flex flex-col gap-1.5 px-0 py-0">
          <Section
            title="Unstaged Files" count={unstaged.length} tone="unstaged"
            entries={unstaged}
            selectedPath={selectedFile?.path ?? null}
            actions={unstaged.length > 0 ? <StageAllButton prominent /> : undefined}
            onDiscard={setConfirmEntry}
            onContextMenu={handleContextMenu}
            emptyMessage={status.data.isClean ? 'Working tree clean' : 'No unstaged tracked files'}
            emptyHint={status.data.isClean ? 'Open, edit, or create files in this repository and they will appear here.' : 'Tracked changes will appear here until you stage them.'}
            fill
          />
          <Section
            title="Untracked Files"
            count={untracked.length}
            tone="untracked"
            entries={untracked}
            selectedPath={selectedFile?.path ?? null}
            onDiscard={setConfirmEntry}
            onContextMenu={handleContextMenu}
            emptyMessage="No untracked files"
            emptyHint="New files will appear here before they are staged."
            collapsibleWhenEmpty
            listClassName="max-h-48"
          />
        </div>
      </div>
      <div
        className="wk-composer-resizer"
        onMouseDown={handleComposerDragStart}
        title="Drag to resize commit composer"
      />
      <div
        style={{ height: clampedComposerHeight }}
        className="shrink-0 min-h-[140px] overflow-hidden"
      >
        <CommitForm />
      </div>

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
      {contextMenu && (
        <ContextMenuOverlay
          x={contextMenu.x}
          y={contextMenu.y}
          entry={contextMenu.entry}
          onClose={() => setContextMenu(null)}
          onRefetch={() => void status.refetch()}
          onDiscard={() => {
            setConfirmEntry(contextMenu.entry);
            setContextMenu(null);
          }}
        />
      )}
    </div>
  );
}

function WorkspaceStat({
  tone,
  value,
  label,
}: {
  tone: 'staged' | 'unstaged' | 'untracked';
  value: number;
  label: string;
}) {
  const toneClass = tone === 'staged'
    ? 'text-git-added border-git-added/25 bg-git-added/8'
    : tone === 'unstaged'
      ? 'text-git-modified border-git-modified/25 bg-git-modified/8'
      : 'text-git-untracked border-git-untracked/25 bg-git-untracked/8';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 ${toneClass}`}>
      <span className="font-semibold">{value}</span>
      <span>{label}</span>
    </span>
  );
}

export function buildCommitMessage(summary: string, description: string): string {
  const trimmedSummary = summary.trim();
  const trimmedDescription = description.trim();
  if (!trimmedDescription) return trimmedSummary;
  return `${trimmedSummary}\n\n${trimmedDescription}`;
}

function StageAllButton({ prominent = false }: { prominent?: boolean }) {
  const stageAll = useStageAll();
  return (
    <button
      className={prominent
        ? 'btn btn-primary !text-[11px] !px-2.5 !py-1'
        : 'text-xs flex items-center gap-1 px-1.5 py-0.5 rounded text-git-added hover:bg-git-added/10'}
      onClick={() => stageAll.mutate()}
      disabled={stageAll.isPending}
      title="Stage all"
    >
      {stageAll.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
      {prominent ? 'Stage All Changes' : 'All'}
    </button>
  );
}

function UnstageAllButton({ prominent = false }: { prominent?: boolean }) {
  const unstageAll = useUnstageAll();
  return (
    <button
      className={prominent
        ? 'btn !text-[11px] !px-2.5 !py-1 border-git-modified/35 text-git-modified hover:bg-git-modified/10 hover:border-git-modified/50'
        : 'text-xs flex items-center gap-1 px-1.5 py-0.5 rounded text-git-modified hover:bg-git-modified/10'}
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
  tone,
  entries,
  selectedPath,
  actions,
  onDiscard,
  onContextMenu,
  emptyMessage,
  emptyHint,
  collapsibleWhenEmpty,
  fill,
  listClassName,
}: {
  title: string;
  count: number;
  tone: 'staged' | 'unstaged' | 'untracked' | 'conflicted';
  entries: StatusEntry[];
  selectedPath: string | null;
  actions?: React.ReactNode;
  onDiscard: (e: StatusEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: StatusEntry) => void;
  emptyMessage?: string;
  emptyHint?: string;
  collapsibleWhenEmpty?: boolean;
  fill?: boolean;
  listClassName?: string;
}) {
  if (count === 0 && collapsibleWhenEmpty) return null;
  const toneClass = tone === 'staged'
    ? 'border-git-added/30 bg-git-added/6'
    : tone === 'unstaged'
      ? 'border-git-modified/30 bg-git-modified/6'
      : tone === 'untracked'
        ? 'border-git-untracked/30 bg-git-untracked/6'
        : 'border-git-conflicted/30 bg-git-conflicted/6';

  return (
    <section className={`wk-section ${toneClass} ${fill ? 'flex-1 min-h-0 flex flex-col' : 'shrink-0'}`}>
      <div className="wk-section-header">
        <div className="flex items-center gap-2 min-w-0">
          <span className="wk-section-title">{title}</span>
          <span className="wk-count-badge">{count}</span>
        </div>
        <div className="flex items-center gap-2">
          {actions}
        </div>
      </div>
      <div className={`bg-bg-panel/90 overflow-y-auto overscroll-contain ${fill ? 'flex-1 min-h-0' : listClassName ?? ''}`}>
        {entries.length > 0 ? (
          entries.map((e) => (
            <FileRow
              key={`${e.path}:${e.oldPath ?? ''}`}
              entry={e}
              selected={selectedPath === e.path}
              onDiscard={() => onDiscard(e)}
              onContextMenu={onContextMenu}
            />
          ))
        ) : (
          <EmptySectionState tone={tone} message={emptyMessage ?? 'Nothing here yet'} hint={emptyHint} />
        )}
      </div>
    </section>
  );
}

function EmptySectionState({
  tone,
  message,
  hint,
}: {
  tone: 'staged' | 'unstaged' | 'untracked' | 'conflicted';
  message: string;
  hint?: string;
}) {
  const iconTone = tone === 'staged'
    ? 'text-git-added'
    : tone === 'unstaged'
      ? 'text-git-modified'
      : tone === 'untracked'
        ? 'text-git-untracked'
        : 'text-git-conflicted';

  return (
    <div className="px-3 py-2.5">
      <div className={`text-[11px] font-medium ${iconTone}`}>{message}</div>
      {hint && <div className="mt-0.5 text-[11px] text-fg-dim leading-4">{hint}</div>}
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

function FileRow({
  entry,
  selected,
  onDiscard,
  onContextMenu,
}: {
  entry: StatusEntry;
  selected: boolean;
  onDiscard: () => void;
  onContextMenu: (e: React.MouseEvent, entry: StatusEntry) => void;
}) {
  const stage = useStage();
  const unstage = useUnstage();

  const label = entry.oldPath ? `${entry.oldPath} -> ${entry.path}` : entry.path;
  const Icon = KIND_ICON[entry.kind];
  const color = KIND_COLOR[entry.kind];
  const pillToneClass = entry.kind === 'modified'
    ? 'border-git-modified/25 bg-git-modified/10'
    : entry.kind === 'added'
      ? 'border-git-added/25 bg-git-added/10'
      : entry.kind === 'deleted'
        ? 'border-git-deleted/25 bg-git-deleted/10'
        : entry.kind === 'renamed' || entry.kind === 'copied'
          ? 'border-git-renamed/25 bg-git-renamed/10'
          : entry.kind === 'unmerged'
            ? 'border-git-conflicted/25 bg-git-conflicted/10'
            : entry.kind === 'untracked'
              ? 'border-git-untracked/25 bg-git-untracked/10'
              : 'border-border bg-bg/40';
  const statusPill = entry.kind === 'modified'
    ? 'M'
    : entry.kind === 'added'
      ? 'A'
      : entry.kind === 'deleted'
        ? 'D'
        : entry.kind === 'renamed'
          ? 'R'
          : entry.kind === 'copied'
            ? 'C'
            : entry.kind === 'unmerged'
              ? '!'
              : entry.kind === 'untracked'
                ? '?'
                : '•';
  const baseName = entry.path.split('/').pop() ?? entry.path;
  const parentPath = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : null;

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
      className={`group wk-file-row ${selected ? 'wk-file-row-selected' : 'wk-file-row-idle'}`}
      title={entry.path}
      onClick={handleClick}
      onContextMenu={(e) => onContextMenu(e, entry)}
    >
      <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-md border px-1 text-[10px] font-bold shrink-0 ${color} ${pillToneClass}`}>
        {statusPill}
      </span>
      <div className="wk-file-icon">
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`text-xs truncate ${selected ? 'text-fg font-semibold' : 'text-fg'}`}>{baseName}</span>
          {entry.oldPath && <CornerDownRight className="w-3 h-3 text-fg-dim shrink-0" />}
          {entry.oldPath && (
            <span className="text-[11px] text-fg-dim truncate">{entry.oldPath.split('/').pop() ?? entry.oldPath}</span>
          )}
        </div>
        <div className="text-[11px] text-fg-dim truncate">
          {parentPath ?? (entry.oldPath ? label : entry.kind)}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-100">
        {showStage && (
          <button
            className="wk-file-action wk-file-action-stage"
            onClick={handleStage}
            disabled={stage.isPending}
            title="Stage"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}
        {showUnstage && (
          <button
            className="wk-file-action wk-file-action-unstage"
            onClick={handleUnstage}
            disabled={unstage.isPending}
            title="Unstage"
          >
            <Minus className="w-3 h-3" />
          </button>
        )}
        {showDiscard && (
          <button
            className="wk-file-action wk-file-action-discard"
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
    return <PaneErrorState title="Failed to load working tree diff" message={(error as Error).message} />;
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
  const summary = useRepoStore((s) => s.commitSummary);
  const setSummary = useRepoStore((s) => s.setCommitSummary);
  const description = useRepoStore((s) => s.commitDescription);
  const setDescription = useRepoStore((s) => s.setCommitDescription);
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

  const subjectLength = summary.length;
  const maxSubject = settings?.commitSubjectLength ?? 72;

  useEffect(() => {
    if (amend && headCommit.data?.commits[0]) {
      setSummary(headCommit.data.commits[0].subject);
      setDescription(headCommit.data.commits[0].body);
    } else if (!amend) {
      setSummary('');
      setDescription('');
    }
  }, [amend]);

  const handleCommit = () => {
    const message = buildCommitMessage(summary, description);
    if (!message.trim()) return;
    void commit.mutate(
      { message: message.trim(), amend, signoff: signCommit, noVerify },
      {
        onSuccess: () => {
          setSummary('');
          setDescription('');
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
    <div className="wk-composer h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="wk-composer-label">Commit</div>
          <div className="text-sm font-semibold text-fg">Create snapshot from staged changes</div>
        </div>
        {hasStaged && (
          <span className="inline-flex items-center gap-1 rounded-full border border-git-added/25 bg-git-added/10 px-2 py-1 text-[11px] text-git-added">
            <span className="font-semibold">{status.data?.entries.filter((e) => e.staged).length ?? 0}</span>
            ready
          </span>
        )}
      </div>
      <input
        className="wk-composer-input font-sans"
        placeholder="Summary"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        disabled={commit.isPending}
      />
      <textarea
        className="wk-composer-textarea font-sans"
        placeholder="Description (optional, Ctrl+Enter to commit)…"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleCommit();
          }
        }}
        disabled={commit.isPending}
        spellCheck
      />
      <div className="wk-composer-meta">
        <div className="min-w-0">
          {amend && headCommit.data?.commits[0] ? (
            <div className="text-xs text-fg-muted">Amending: {headCommit.data.commits[0].sha.slice(0, 7)}</div>
          ) : (
            <div className="text-xs text-fg-dim">Use summary + optional body, then commit staged work.</div>
          )}
        </div>
        <div className={`${subjectLength > maxSubject ? 'text-git-deleted' : 'text-fg-dim'}`}>
          {subjectLength}/{maxSubject}
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <button className="wk-options-toggle" onClick={() => setShowOptions(!showOptions)}>
          <ChevronRight className={`w-3 h-3 transition-transform ${showOptions ? 'rotate-90' : ''}`} />
          Commit options
        </button>
        <button
          className="btn btn-primary !px-3 !py-1.5"
          onClick={handleCommit}
          disabled={commit.isPending || !summary.trim() || (!hasStaged && !amend)}
          title={(!hasStaged && !amend) ? 'Nothing staged to commit' : 'Commit (Ctrl+Enter)'}
        >
          {commit.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Commit
        </button>
      </div>
      {showOptions && (
        <div className="wk-options-panel">
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

function ContextMenuOverlay({
  x,
  y,
  entry,
  onClose,
  onRefetch,
  onDiscard,
}: {
  x: number;
  y: number;
  entry: StatusEntry;
  onClose: () => void;
  onRefetch: () => void;
  onDiscard: () => void;
}) {
  const repoPath = useRepoStore((s) => s.activeRepo)?.path ?? '';
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenuIndex, setActiveSubmenuIndex] = useState<number | null>(null);

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const basename = entry.path.split('/').pop() ?? entry.path;
  const extMatch = basename.match(/\.([^.]+)$/);
  const extension = extMatch ? extMatch[1] : null;

  interface MenuItem {
    type?: 'divider';
    label?: string;
    danger?: boolean;
    onClick?: () => void | Promise<void>;
    submenu?: Array<{ label: string; onClick: () => void | Promise<void> }>;
  }
  const items: MenuItem[] = [];

  // Stage / Unstage
  if (entry.staged) {
    items.push({
      label: 'Unstage changes',
      onClick: async () => {
        await api.workingTree.unstage([entry.path]);
        onRefetch();
      },
    });
  } else {
    items.push({
      label: 'Stage changes',
      onClick: async () => {
        await api.workingTree.stage([entry.path]);
        onRefetch();
      },
    });
  }

  // Discard changes
  if (!entry.staged || entry.unstaged) {
    items.push({
      label: 'Discard changes',
      onClick: () => {
        onDiscard();
      },
    });
  }

  // Divider
  items.push({ type: 'divider' });

  // Ignore
  if (!entry.staged || entry.kind === 'untracked') {
    const ignoreSubmenu = [
      {
        label: `Ignore '${basename}'`,
        onClick: async () => {
          await api.workingTree.ignore(repoPath, `/${entry.path}`);
          onRefetch();
        },
      },
    ];
    if (extension) {
      ignoreSubmenu.push({
        label: `All files with the extension '.${extension}'`,
        onClick: async () => {
          await api.workingTree.ignore(repoPath, `*.${extension}`);
          onRefetch();
        },
      });
    }
    items.push({
      label: 'Ignore',
      submenu: ignoreSubmenu,
    });
  }

  // Stash file
  if (entry.kind !== 'untracked' && entry.kind !== 'deleted') {
    items.push({
      label: 'Stash file',
      onClick: async () => {
        await api.workingTree.stashFile(repoPath, `${repoPath}/${entry.path}`);
        onRefetch();
      },
    });
  }

  // File History & File Blame
  if (entry.kind !== 'untracked') {
    items.push({
      label: 'File History',
      onClick: () => {
        useRepoStore.getState().setFileHistory(entry.path);
      },
    });
    if (entry.kind !== 'deleted') {
      items.push({
        label: 'File Blame',
        onClick: () => {
          useRepoStore.getState().selectFile({
            path: entry.path,
            staged: entry.staged,
            isCommit: false,
            oldPath: entry.oldPath,
          });
          useRepoStore.getState().setBlameActive(true);
        },
      });
    }
  }

  // Divider
  items.push({ type: 'divider' });

  // External Tools
  if (entry.kind !== 'untracked' && entry.kind !== 'deleted') {
    items.push({
      label: 'Open in external diff tool',
      onClick: async () => {
        await api.terminal.run(`git difftool -y -- "${entry.path}"`);
      },
    });
  }

  if (entry.kind !== 'deleted') {
    items.push({
      label: 'Open in external editor',
      onClick: async () => {
        const editor = settings?.defaultExternalEditor ?? null;
        await api.workingTree.openInEditor(`${repoPath}/${entry.path}`, editor);
      },
    });
    items.push({
      label: 'Open file in default program',
      onClick: async () => {
        await api.shell.openPath(`${repoPath}/${entry.path}`);
      },
    });
    items.push({
      label: 'Show in folder',
      onClick: async () => {
        await api.shell.showItemInFolder(`${repoPath}/${entry.path}`);
      },
    });
  }

  // Copy Path
  items.push({
    label: 'Copy file path',
    onClick: () => {
      void navigator.clipboard.writeText(`${repoPath}/${entry.path}`);
    },
  });

  // Create patch
  if (entry.kind !== 'untracked' && entry.kind !== 'deleted') {
    items.push({
      label: 'Create patch from file changes',
      onClick: async () => {
        await api.workingTree.createPatch(repoPath, `${repoPath}/${entry.path}`);
      },
    });
  }

  // Edit / Delete
  if (entry.kind !== 'deleted') {
    items.push({ type: 'divider' });
    items.push({
      label: 'Edit file',
      onClick: async () => {
        const editor = settings?.defaultExternalEditor ?? null;
        await api.workingTree.openInEditor(`${repoPath}/${entry.path}`, editor);
      },
    });
    items.push({
      label: 'Delete file',
      danger: true,
      onClick: async () => {
        await api.workingTree.deleteFile(repoPath, `${repoPath}/${entry.path}`, entry.staged);
        onRefetch();
      },
    });
  }

  const adjustedX = Math.min(x, window.innerWidth - 230);
  const adjustedY = Math.min(y, window.innerHeight - 340);

  return createPortal(
    <div
      ref={menuRef}
      style={{ top: adjustedY, left: adjustedX }}
      className="fixed z-50 w-56 bg-bg-panel border border-border shadow-2xl rounded-md py-1 text-xs text-fg flex flex-col backdrop-blur-md select-none font-sans"
    >
      {items.map((item, idx) => {
        if (item.type === 'divider') {
          return <div key={idx} className="h-px bg-border my-1" />;
        }

        const hasSubmenu = !!item.submenu;
        const isHovered = activeSubmenuIndex === idx;

        return (
          <div
            key={idx}
            className="relative"
            onMouseEnter={() => {
              if (hasSubmenu) setActiveSubmenuIndex(idx);
              else setActiveSubmenuIndex(null);
            }}
          >
            <button
              onClick={() => {
                if (!hasSubmenu && item.onClick) {
                  void item.onClick();
                  onClose();
                }
              }}
              className={`w-full px-3 py-1.5 text-left flex items-center justify-between transition-colors ${
                item.danger
                  ? 'text-git-deleted hover:bg-git-deleted/10'
                  : 'hover:bg-accent/10 hover:text-fg'
              }`}
            >
              <span>{item.label}</span>
              {hasSubmenu && <ChevronRight className="w-3.5 h-3.5 text-fg-dim" />}
            </button>

            {hasSubmenu && isHovered && (
              <div className="absolute left-full top-0 ml-0.5 w-60 bg-bg-panel border border-border shadow-2xl rounded-md py-1 text-xs text-fg flex flex-col animate-in fade-in slide-in-from-left-2 duration-100">
                {item.submenu?.map((sub, subIdx) => (
                  <button
                    key={subIdx}
                    onClick={() => {
                      void sub.onClick();
                      onClose();
                    }}
                    className="w-full px-3 py-1.5 text-left hover:bg-accent/10 hover:text-fg transition-colors"
                  >
                    {sub.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>,
    document.body
  );
}

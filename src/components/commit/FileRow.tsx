import {
  AlertCircle,
  CornerDownRight,
  FileEdit,
  FileMinus,
  FileOutput,
  FilePlus,
  Minus,
  Plus,
  RotateCcw,
} from 'lucide-react';
import type { EntryKind, StatusEntry } from '@shared/git';
import { useStage, useUnstage } from '../../queries/useMutations';
import { useRepoStore } from '../../stores/repo';
import { getFileActionEligibility, type FileListContext } from './model';

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
  untracked: 'text-git-added',
  ignored: 'text-fg-dim',
};

const KIND_LABEL: Record<EntryKind, string> = {
  modified: 'M', added: 'A', deleted: 'D', renamed: 'R', copied: 'C',
  unmerged: '!', untracked: '+', ignored: '•',
};

export function FileRow({
  entry,
  context,
  depth = 0,
  onDiscard,
  onContextMenu,
}: {
  entry: StatusEntry;
  context: FileListContext;
  depth?: number;
  onDiscard: (entry: StatusEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: StatusEntry) => void;
}) {
  const stage = useStage();
  const unstage = useUnstage();
  const selected = useRepoStore((state) => (
    state.mainView.kind === 'working-tree-diff'
    && state.mainView.path === entry.path
    && state.mainView.source === context
  ));
  const openDiff = useRepoStore((state) => state.openWorkingTreeDiff);
  const eligibility = getFileActionEligibility(entry, context);
  const Icon = KIND_ICON[entry.kind];
  const color = KIND_COLOR[entry.kind];
  const baseName = entry.path.replace(/\\/g, '/').split('/').at(-1) ?? entry.path;
  const normalized = entry.path.replace(/\\/g, '/');
  const parentPath = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : '';

  return (
    <div
      className={`group wk-file-row ${selected ? 'wk-file-row-selected' : 'wk-file-row-idle'}`}
      style={{ paddingLeft: `${10 + depth * 14}px` }}
      role="button"
      tabIndex={0}
      title={entry.path}
      onClick={() => openDiff(entry.path, context)}
      onContextMenu={(e) => onContextMenu(e, entry)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDiff(entry.path, context);
        }
      }}
    >
      <span className={`wk-status-mark ${color}`}>{KIND_LABEL[entry.kind]}</span>
      <span className="wk-file-icon"><Icon className={`w-3.5 h-3.5 ${color}`} /></span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs text-fg truncate">{baseName}</span>
          {entry.oldPath && <CornerDownRight className="w-3 h-3 text-fg-dim shrink-0" />}
          {entry.oldPath && <span className="text-[10px] text-fg-dim truncate">{entry.oldPath}</span>}
        </span>
        {parentPath && <span className="block text-[10px] text-fg-dim truncate mt-0.5">{parentPath}</span>}
      </span>
      <span className="wk-file-actions">
        {eligibility.canStage && (
          <button
            className="wk-file-action wk-file-action-stage"
            title="Stage file"
            aria-label={`Stage ${entry.path}`}
            disabled={stage.isPending}
            onClick={(event) => { event.stopPropagation(); stage.mutate([entry.path]); }}
          ><Plus className="w-3 h-3" /></button>
        )}
        {eligibility.canUnstage && (
          <button
            className="wk-file-action wk-file-action-unstage"
            title="Unstage file"
            aria-label={`Unstage ${entry.path}`}
            disabled={unstage.isPending}
            onClick={(event) => { event.stopPropagation(); unstage.mutate([entry.path]); }}
          ><Minus className="w-3 h-3" /></button>
        )}
        {eligibility.canDiscard && (
          <button
            className="wk-file-action wk-file-action-discard"
            title="Discard file changes"
            aria-label={`Discard ${entry.path}`}
            onClick={(event) => { event.stopPropagation(); onDiscard(entry); }}
          ><RotateCcw className="w-3 h-3" /></button>
        )}
      </span>
    </div>
  );
}

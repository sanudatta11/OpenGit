import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useStatus } from '../../queries/useRepo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  List,
  Loader2,
  Minus,
  Plus,
  Trees,
} from 'lucide-react';
import type { StatusEntry } from '@shared/git';
import type { SettingsData } from '@shared/ipc';
import { api } from '../../ipc/api';
import { useDiscard, useStageAll, useUnstageAll } from '../../queries/useMutations';
import { ConfirmDialog } from '../ConfirmDialog';
import { FileRow } from './FileRow';
import { useRepoStore } from '../../stores/repo';
import {
  buildPathTree,
  comparePaths,
  type CommitPanelSort,
  type CommitPanelView,
  type FileListContext,
  type PathTreeNode,
} from './model';

export function FileChanges({ entries }: { entries: readonly StatusEntry[] }) {
  const status = useStatus();
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() });
  const saveSettings = useMutation({
    mutationFn: (input: Partial<SettingsData>) => api.settings.set(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
  const [view, setView] = useState<CommitPanelView>('path');
  const [sort, setSort] = useState<CommitPanelSort>('asc');
  const [unstagedOpen, setUnstagedOpen] = useState(true);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [confirmEntry, setConfirmEntry] = useState<StatusEntry | null>(null);
  const discard = useDiscard();

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

  useEffect(() => {
    if (!settings.data) return;
    setView(settings.data.commitPanelView);
    setSort(settings.data.commitPanelSort);
    setUnstagedOpen(settings.data.commitPanelUnstagedExpanded);
    setStagedOpen(settings.data.commitPanelStagedExpanded);
  }, [settings.data]);

  const conflicts = entries.filter((entry) => entry.kind === 'unmerged');
  const unstaged = entries.filter((entry) => entry.unstaged && entry.kind !== 'unmerged');
  const staged = entries.filter((entry) => entry.staged && entry.kind !== 'unmerged');

  const updateView = (next: CommitPanelView) => {
    setView(next);
    saveSettings.mutate({ commitPanelView: next });
  };
  const updateSort = (next: CommitPanelSort) => {
    setSort(next);
    saveSettings.mutate({ commitPanelSort: next });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="h-11 shrink-0 px-3 border-b border-border bg-bg/25 flex items-center gap-2">
        <button
          className="icon-btn !w-8 !h-8"
          title={sort === 'asc' ? 'Sort Z–A' : 'Sort A–Z'}
          aria-label={sort === 'asc' ? 'Sort descending' : 'Sort ascending'}
          onClick={() => updateSort(sort === 'asc' ? 'desc' : 'asc')}
        >
          {sort === 'asc' ? <ArrowDownAZ className="w-4 h-4" /> : <ArrowUpAZ className="w-4 h-4" />}
        </button>
        <div className="ml-auto inline-flex rounded-md border border-border bg-bg/40 p-0.5" aria-label="File layout">
          <button className={`commit-view-toggle ${view === 'path' ? 'commit-view-toggle-active' : ''}`} onClick={() => updateView('path')}>
            <List className="w-3.5 h-3.5" /> Path
          </button>
          <button className={`commit-view-toggle ${view === 'tree' ? 'commit-view-toggle-active' : ''}`} onClick={() => updateView('tree')}>
            <Trees className="w-3.5 h-3.5" /> Tree
          </button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="mx-3 mt-3 rounded-md border border-git-conflicted/35 bg-git-conflicted/10 px-3 py-2 flex items-start gap-2 text-xs text-git-conflicted">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span><strong>{conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}</strong> must be resolved before committing.</span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2">
        <FileAccordion
          title="Unstaged Files"
          entries={unstaged}
          context="unstaged"
          open={unstagedOpen}
          view={view}
          sort={sort}
          bulkDisabled={conflicts.length > 0}
          onToggle={() => {
            const next = !unstagedOpen;
            setUnstagedOpen(next);
            saveSettings.mutate({ commitPanelUnstagedExpanded: next });
          }}
          onDiscard={setConfirmEntry}
          onContextMenu={handleContextMenu}
        />
        <FileAccordion
          title="Staged Files"
          entries={staged}
          context="staged"
          open={stagedOpen}
          view={view}
          sort={sort}
          bulkDisabled={conflicts.length > 0}
          onToggle={() => {
            const next = !stagedOpen;
            setStagedOpen(next);
            saveSettings.mutate({ commitPanelStagedExpanded: next });
          }}
          onDiscard={setConfirmEntry}
          onContextMenu={handleContextMenu}
        />
      </div>

      <ConfirmDialog
        open={!!confirmEntry}
        title={confirmEntry?.kind === 'untracked' ? 'Delete untracked file?' : 'Discard file changes?'}
        message={confirmEntry?.kind === 'untracked'
          ? `Delete “${confirmEntry.path}”? This cannot be undone.`
          : `Discard unstaged changes in “${confirmEntry?.path}”? Staged content will be preserved.`}
        confirmLabel={confirmEntry?.kind === 'untracked' ? 'Delete file' : 'Discard changes'}
        danger
        onConfirm={() => {
          if (!confirmEntry) return;
          discard.mutate({ paths: [confirmEntry.path], untracked: confirmEntry.kind === 'untracked' });
          setConfirmEntry(null);
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

function FileAccordion({
  title,
  entries,
  context,
  open,
  view,
  sort,
  bulkDisabled,
  onToggle,
  onDiscard,
  onContextMenu,
}: {
  title: string;
  entries: StatusEntry[];
  context: FileListContext;
  open: boolean;
  view: CommitPanelView;
  sort: CommitPanelSort;
  bulkDisabled: boolean;
  onToggle: () => void;
  onDiscard: (entry: StatusEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: StatusEntry) => void;
}) {
  const stageAll = useStageAll();
  const unstageAll = useUnstageAll();
  const sorted = useMemo(
    () => [...entries].sort((a, b) => comparePaths(a.path, b.path, sort)),
    [entries, sort],
  );

  return (
    <section className="commit-accordion">
      <div className="commit-accordion-header">
        <button className="min-w-0 flex items-center gap-1.5 text-left" onClick={onToggle} aria-expanded={open}>
          {open ? <ChevronDown className="w-4 h-4 text-fg-dim" /> : <ChevronRight className="w-4 h-4 text-fg-dim" />}
          <span className="text-xs font-semibold text-fg truncate">{title} ({entries.length})</span>
        </button>
        {entries.length > 0 && context === 'unstaged' && (
          <button className="commit-bulk-action commit-bulk-stage" title={bulkDisabled ? 'Resolve conflicts before staging all changes' : 'Stage all changes'} disabled={stageAll.isPending || bulkDisabled} onClick={() => stageAll.mutate()}>
            {stageAll.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Stage All Changes
          </button>
        )}
        {entries.length > 0 && context === 'staged' && (
          <button className="commit-bulk-action commit-bulk-unstage" disabled={unstageAll.isPending || bulkDisabled} onClick={() => unstageAll.mutate()}>
            {unstageAll.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Minus className="w-3 h-3" />}
            Unstage All
          </button>
        )}
      </div>
      {open && (
        <div className="commit-file-list">
          {entries.length === 0 ? (
            <div className="px-3 py-4 text-xs text-fg-dim">No {context} files</div>
          ) : view === 'path' ? (
            sorted.map((entry) => <FileRow key={entry.path} entry={entry} context={context} onDiscard={onDiscard} onContextMenu={onContextMenu} />)
          ) : (
            <TreeRows entries={entries} context={context} sort={sort} onDiscard={onDiscard} onContextMenu={onContextMenu} />
          )}
        </div>
      )}
    </section>
  );
}

function TreeRows({ entries, context, sort, onDiscard, onContextMenu }: {
  entries: StatusEntry[];
  context: FileListContext;
  sort: CommitPanelSort;
  onDiscard: (entry: StatusEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: StatusEntry) => void;
}) {
  const tree = useMemo(() => buildPathTree(entries, sort), [entries, sort]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return <>{tree.map((node) => <TreeNodeRow key={node.path} node={node} depth={0} context={context} collapsed={collapsed} setCollapsed={setCollapsed} onDiscard={onDiscard} onContextMenu={onContextMenu} />)}</>;
}

function TreeNodeRow({ node, depth, context, collapsed, setCollapsed, onDiscard, onContextMenu }: {
  node: PathTreeNode;
  depth: number;
  context: FileListContext;
  collapsed: Set<string>;
  setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>;
  onDiscard: (entry: StatusEntry) => void;
  onContextMenu: (e: React.MouseEvent, entry: StatusEntry) => void;
}) {
  if (node.kind === 'file') return <FileRow entry={node.entry} context={context} depth={depth} onDiscard={onDiscard} onContextMenu={onContextMenu} />;
  const isCollapsed = collapsed.has(node.path);
  return (
    <>
      <button
        className="w-full px-2.5 py-1.5 flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg hover:bg-bg-hover/60"
        style={{ paddingLeft: `${10 + depth * 14}px` }}
        onClick={() => setCollapsed((current) => {
          const next = new Set(current);
          if (next.has(node.path)) next.delete(node.path); else next.add(node.path);
          return next;
        })}
      >
        {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {isCollapsed ? <Folder className="w-3.5 h-3.5 text-git-modified" /> : <FolderOpen className="w-3.5 h-3.5 text-git-modified" />}
        <span className="truncate">{node.name}</span>
      </button>
      {!isCollapsed && node.children.map((child) => (
        <TreeNodeRow key={child.path} node={child} depth={depth + 1} context={context} collapsed={collapsed} setCollapsed={setCollapsed} onDiscard={onDiscard} onContextMenu={onContextMenu} />
      ))}
    </>
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

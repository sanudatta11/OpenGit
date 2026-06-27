import { useEffect, useMemo, useRef, useState } from 'react';
import type { Commit, RefLabel } from '@shared/git';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import type { SettingsData } from '@shared/ipc';
import type { GraphRow as GraphLayoutRow } from '../../graph/layout';
import { useLog, useStatus } from '../../queries/useRepo';
import { useRepoStore, cacheCommits } from '../../stores/repo';
import { useToastStore } from '../../stores/toast';
import { useGraphFilterStore } from '../../stores/graphFilter';
import { compileGraphLayout } from '../../graph/layout';
import { colorWithAlpha, graphColorByKey, laneColorByIndex } from '../../graph/colors';
import { authorVisual } from '../../graph/authorVisual';
import {
  applyPendingGraphWidthShrink,
  computeGraphLeadWidthForLaneCount,
  computeGraphVisibleWindow,
  computeVisibleGraphLaneCount,
  graphRefRailInset,
  graphRefRailWidth,
  graphRowHeight,
  graphRowMaxVisibleRefs,
  graphRowShowsInlineMeta,
  graphRowTemplateColumns,
  graphContentScrollTop,
  GRAPH_LANE_PADDING,
  GRAPH_LANE_WIDTH,
  updateGraphWidthStabilization,
} from '../../graph/rowLayout';
import { GitCommit, Search, X, EyeOff, Eye, Clock, ShieldAlert, GitCompare, ListTree } from 'lucide-react';
import { GitError } from '@shared/ipc';
import { useCommit, useCheckout, useCreateBranch, useCherryPick, useRevert, useReset, useRebase, useMerge } from '../../queries/useMutations';
import { ConfirmDialog } from '../ConfirmDialog';
import { BranchBadge } from './decorations/BranchBadge';
import { TagBadge } from './decorations/TagBadge';
import { HeadIndicator } from './decorations/HeadIndicator';
import { PaneErrorState } from '../ErrorBoundary';
import { summarizeWip } from '../commit/model';

type Density = 'compact' | 'comfortable' | 'detailed';

const GRAPH_WIDTH_SHRINK_DELAY_MS = 160;
const GRAPH_SCROLL_IDLE_MS = 120;

interface ParsedQuery {
  file?: string;
  author?: string;
  branch?: string;
  hash?: string;
  message?: string;
}

function parseSearchQuery(query: string): ParsedQuery {
  const parts = query.trim().split(/\s+/);
  const result: ParsedQuery = {};
  const messageParts: string[] = [];

  for (const part of parts) {
    if (part.startsWith('author:')) {
      result.author = part.slice('author:'.length).toLowerCase();
    } else if (part.startsWith('branch:')) {
      result.branch = part.slice('branch:'.length).toLowerCase();
    } else if (part.startsWith('file:')) {
      result.file = part.slice('file:'.length);
    } else if (part.startsWith('hash:')) {
      result.hash = part.slice('hash:'.length).toLowerCase();
    } else if (part.trim() !== '') {
      messageParts.push(part);
    }
  }

  if (messageParts.length > 0) {
    result.message = messageParts.join(' ').toLowerCase();
  }

  return result;
}

export function GraphPane() {
  const activeRepoPath = useRepoStore((s) => s.activeRepo?.path ?? null);
  const selectedSha = useRepoStore((s) => s.selectedCommitSha);
  const openCommitDetails = useRepoStore((s) => s.openCommitDetails);
  const setMainView = useRepoStore((s) => s.setMainView);
  const showGraph = useRepoStore((s) => s.showGraph);
  const fileHistoryPath = useRepoStore((s) => s.fileHistoryPath);
  const setFileHistory = useRepoStore((s) => s.setFileHistory);
  const [limit, setLimit] = useState(200);
  const [searchQuery, setSearchQuery] = useState('');
  const [density, setDensity] = useState<Density>('comfortable');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; commit: Commit } | null>(null);
  const [createBranchAtCommit, setCreateBranchAtCommit] = useState<Commit | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [resetConfirmCommit, setResetConfirmCommit] = useState<Commit | null>(null);
  const [resetMode, setResetMode] = useState<'soft' | 'mixed' | 'hard'>('mixed');
  const [mergeConfirmCommit, setMergeConfirmCommit] = useState<Commit | null>(null);
  const [refCtx, setRefCtx] = useState<{ x: number; y: number; ref: RefLabel } | null>(null);
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
  const qc = useQueryClient();
  const setSetting = useMutation({
    mutationFn: (input: Partial<SettingsData>) => api.settings.set(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });

  const [zoom, setZoom] = useState(1.0);

  // Sync zoom state with loaded settings once settings load
  useEffect(() => {
    if (settings?.graphZoom !== undefined) {
      setZoom(settings.graphZoom);
    }
  }, [settings?.graphZoom]);

  // Debounced write back of zoom level to settings to avoid disk thrashing during wheel scrolling
  useEffect(() => {
    if (!settings) return; // Only write back if settings have finished loading
    if (settings.graphZoom === zoom) return;
    const timer = setTimeout(() => {
      void setSetting.mutate({ graphZoom: zoom });
    }, 600);
    return () => clearTimeout(timer);
  }, [zoom, settings, settings?.graphZoom]);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [isScrolling, setIsScrolling] = useState(false);
  const [renderGraphLaneCount, setRenderGraphLaneCount] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollIdleTimerRef = useRef<number | null>(null);
  const shrinkTimerRef = useRef<number | null>(null);
  const pendingShrinkLaneCountRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const scrollTopRef = useRef(0);

  const checkout = useCheckout();
  const createBranch = useCreateBranch();
  const cherryPick = useCherryPick();
  const revert = useRevert();
  const reset = useReset();
  const rebase = useRebase();
  const merge = useMerge();

  const status = useQuery({
    queryKey: activeRepoPath ? ['status', activeRepoPath] : ['status', 'none'],
    queryFn: () => api.repo.status(),
    enabled: !!activeRepoPath,
    refetchOnWindowFocus: false,
  });

  const parsed = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);
  const paths = useMemo(() => {
    if (fileHistoryPath) return [fileHistoryPath];
    if (parsed.file) return [parsed.file];
    return undefined;
  }, [parsed.file, fileHistoryPath]);

  const soloedRefs = useGraphFilterStore((s) => s.soloedRefs);
  const mutedRefs = useGraphFilterStore((s) => s.mutedRefs);
  const filterActive = useGraphFilterStore((s) => s.isActive);
  const clearAllFilters = useGraphFilterStore((s) => s.clearAll);

  const logRange = useMemo(() => {
    if (soloedRefs.length === 0) return undefined;
    return soloedRefs.join(' ');
  }, [soloedRefs]);

  const log = useLog(logRange, 0, limit, paths);
  const rowHeight = graphRowHeight(density);

  useEffect(() => {
    if (log.data?.commits && activeRepoPath) cacheCommits(activeRepoPath, log.data.commits);
  }, [activeRepoPath, log.data]);

  useEffect(() => {
    setLimit(200);
    setSearchQuery('');
    setContextMenu(null);
    setCreateBranchAtCommit(null);
    setNewBranchName('');
    setResetConfirmCommit(null);
    setMergeConfirmCommit(null);
    setRefCtx(null);
    setScrollTop(0);
    setIsScrolling(false);
    setRenderGraphLaneCount(1);
    pendingShrinkLaneCountRef.current = null;
    if (containerRef.current) containerRef.current.scrollTop = 0;
    if (scrollIdleTimerRef.current !== null) {
      window.clearTimeout(scrollIdleTimerRef.current);
      scrollIdleTimerRef.current = null;
    }
    if (shrinkTimerRef.current !== null) {
      window.clearTimeout(shrinkTimerRef.current);
      shrinkTimerRef.current = null;
    }
  }, [activeRepoPath]);

  useEffect(() => {
    const close = () => {
      setContextMenu(null);
      setRefCtx(null);
    };
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const filteredCommits = useMemo(() => {
    if (!log.data?.commits) return [];
    return log.data.commits.filter((commit) => {
      if (parsed.author && !commit.author.name.toLowerCase().includes(parsed.author) && !commit.author.email.toLowerCase().includes(parsed.author)) {
        return false;
      }
      if (parsed.branch && !commit.refs.some((r) => r.shortName.toLowerCase().includes(parsed.branch!))) {
        return false;
      }
      if (parsed.hash && !commit.sha.toLowerCase().startsWith(parsed.hash)) {
        return false;
      }
      if (parsed.message) {
        const m = parsed.message;
        const subjectMatch = commit.subject.toLowerCase().includes(m);
        const authorMatch = commit.author.name.toLowerCase().includes(m);
        const shaMatch = commit.sha.toLowerCase().startsWith(m);
        const refMatch = commit.refs.some((r) => r.shortName.toLowerCase().includes(m));
        if (!subjectMatch && !authorMatch && !shaMatch && !refMatch) {
          return false;
        }
      }
      return true;
    });
  }, [log.data?.commits, parsed]);

  const layout = useMemo(() => compileGraphLayout(filteredCommits), [filteredCommits]);
  const rows = layout.rows;
  const totalHeight = rows.length * rowHeight;
  const wip = summarizeWip(status.data?.entries ?? []);
  const hasWip = wip.files > 0;
  const refRailWidth = graphRefRailWidth(density);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      markScrolling();
      setZoom((prev) => Math.min(2, Math.max(0.5, prev + (e.deltaY > 0 ? -0.1 : 0.1))));
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    markScrolling();
    scrollTopRef.current = el.scrollTop;
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setScrollTop(scrollTopRef.current);
      });
    }
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      if (log.data?.hasMore && !log.isFetching) {
        setLimit((prev) => prev + 200);
      }
    }
  };

  const handleRefContext = (e: React.MouseEvent, ref: RefLabel) => {
    e.preventDefault();
    e.stopPropagation();
    setRefCtx({ x: e.clientX, y: e.clientY, ref });
  };

  const graphScrollTop = graphContentScrollTop(scrollTop, rowHeight, zoom, hasWip);
  const windowed = computeGraphVisibleWindow(graphScrollTop, viewportHeight, rowHeight, zoom, rows.length);
  const firstRow = windowed.firstRow;
  const lastRow = windowed.lastRow;
  const visibleRows = rows.slice(firstRow, lastRow);
  const offsetY = windowed.offsetY;
  const targetGraphLaneCount = computeVisibleGraphLaneCount(visibleRows, { selectedSha });
  const graphWidth = computeGraphLeadWidthForLaneCount(renderGraphLaneCount);

  useEffect(() => {
    const next = updateGraphWidthStabilization({
      renderLaneCount: renderGraphLaneCount,
      pendingShrinkLaneCount: pendingShrinkLaneCountRef.current,
      targetLaneCount: targetGraphLaneCount,
    });

    pendingShrinkLaneCountRef.current = next.pendingShrinkLaneCount;

    if (next.renderLaneCount !== renderGraphLaneCount) {
      setRenderGraphLaneCount(next.renderLaneCount);
      return;
    }

    if (shrinkTimerRef.current !== null) {
      window.clearTimeout(shrinkTimerRef.current);
      shrinkTimerRef.current = null;
    }

    if (next.pendingShrinkLaneCount !== null && !isScrolling) {
      shrinkTimerRef.current = window.setTimeout(() => {
        const pendingShrinkLaneCount = pendingShrinkLaneCountRef.current;
        if (pendingShrinkLaneCount === null) return;

        pendingShrinkLaneCountRef.current = null;
        setRenderGraphLaneCount((current) => (
          applyPendingGraphWidthShrink({
            renderLaneCount: current,
            pendingShrinkLaneCount,
          }).renderLaneCount
        ));
      }, GRAPH_WIDTH_SHRINK_DELAY_MS);
    }
  }, [isScrolling, renderGraphLaneCount, targetGraphLaneCount]);

  useEffect(() => () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    if (scrollIdleTimerRef.current !== null) {
      window.clearTimeout(scrollIdleTimerRef.current);
    }
    if (shrinkTimerRef.current !== null) {
      window.clearTimeout(shrinkTimerRef.current);
    }
  }, []);

  function markScrolling() {
    if (!isScrolling) {
      setIsScrolling(true);
    }

    if (shrinkTimerRef.current !== null) {
      window.clearTimeout(shrinkTimerRef.current);
      shrinkTimerRef.current = null;
    }

    if (scrollIdleTimerRef.current !== null) {
      window.clearTimeout(scrollIdleTimerRef.current);
    }

    scrollIdleTimerRef.current = window.setTimeout(() => {
      setIsScrolling(false);
      scrollIdleTimerRef.current = null;
    }, GRAPH_SCROLL_IDLE_MS);
  }

  if (log.isLoading && limit === 200) {
    return <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">Loading commits…</div>;
  }
  if (log.error) {
    return <GraphError error={log.error} qc={qc} />;
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-bg">
      <div className="h-10 border-b border-border bg-bg-panel px-3 flex items-center justify-between shrink-0 gap-3">
        <div className="flex-1 max-w-md relative flex items-center">
          <input
            className="input w-full pl-7 pr-7"
            placeholder="Search commits (e.g. author:sanu file:package.json)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Search className="w-3.5 h-3.5 text-fg-dim absolute left-2.5" />
          {searchQuery && (
            <button className="absolute right-2.5 text-fg-dim hover:text-fg" onClick={() => setSearchQuery('')}>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 select-none">
          <button className="text-xs px-2 py-0.5 rounded text-fg-muted hover:bg-bg-hover hover:text-fg flex items-center gap-1" onClick={() => setMainView({ kind: 'compare' })}>
            <GitCompare className="w-3.5 h-3.5" /> Compare
          </button>
          <button className="text-xs px-2 py-0.5 rounded text-fg-muted hover:bg-bg-hover hover:text-fg flex items-center gap-1" onClick={() => setMainView({ kind: 'operation-actions' })}>
            <ListTree className="w-3.5 h-3.5" /> Actions
          </button>
          <span className="text-fg-dim mx-1">|</span>
          <span className="text-xs text-fg-muted mr-1">Density:</span>
          {(['compact', 'comfortable', 'detailed'] as Density[]).map((d) => (
            <button
              key={d}
              className={`text-xs px-2 py-0.5 rounded capitalize transition-colors ${density === d ? 'bg-accent/20 text-accent font-semibold' : 'text-fg-muted hover:bg-bg-hover'}`}
              onClick={() => setDensity(d)}
            >
              {d}
            </button>
          ))}
          <span className="text-fg-dim mx-1">|</span>
          <span className="text-xxs text-fg-muted">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      {filterActive() && (
        <div className="border-b border-accent/30 bg-accent/5 px-3 py-1.5 flex items-center gap-2 shrink-0 text-xs animate-slide-down">
          <Eye className="w-3 h-3 text-accent shrink-0" />
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap text-fg-muted">
            {soloedRefs.length > 0 && (
              <span>
                Soloed: {soloedRefs.map((r) => (
                  <span key={r} className="inline-flex items-center gap-0.5 bg-accent/10 text-accent px-1 py-0 rounded mr-1">{r}<X className="w-2.5 h-2.5 cursor-pointer hover:text-fg" onClick={() => useGraphFilterStore.getState().unsolo(r)} /></span>
                ))}
              </span>
            )}
            {mutedRefs.length > 0 && (
              <span>
                Muted: {mutedRefs.map((r) => (
                  <span key={r} className="inline-flex items-center gap-0.5 bg-fg-dim/10 text-fg-dim px-1 py-0 rounded mr-1">{r}<X className="w-2.5 h-2.5 cursor-pointer hover:text-fg" onClick={() => useGraphFilterStore.getState().unmute(r)} /></span>
                ))}
              </span>
            )}
          </div>
          <button className="icon-btn !w-6 !h-6" onClick={clearAllFilters} title="Clear all filters">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {fileHistoryPath && (
        <div className="border-b border-accent/30 bg-accent/5 px-3 py-1.5 flex items-center gap-2 shrink-0 text-xs">
          <Clock className="w-3 h-3 text-accent shrink-0" />
          <span className="text-fg-muted flex-1">File history: <span className="font-mono text-fg">{fileHistoryPath}</span></span>
          <button className="icon-btn !w-6 !h-6" onClick={() => setFileHistory(null)} title="Clear file history">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden relative"
        onScroll={handleScroll}
        onWheel={handleWheel}
      >
        <div style={{ zoom, width: `${100 / zoom}%` }}>
          {hasWip && (
            <WipGraphRow
              graphWidth={graphWidth}
              rowHeight={rowHeight}
              density={density}
              lane={rows[0]?.node.lane ?? 0}
              colorKey={rows[0]?.node.colorKey ?? 'wip'}
              additions={wip.additions}
              modifications={wip.modifications}
              onClick={() => {
                showGraph();
                requestAnimationFrame(() => document.getElementById('commit-sidebar-header')?.focus());
              }}
            />
          )}
          {rows.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-fg-muted text-sm gap-2">
              <GitCommit className="w-8 h-8 text-fg-dim" />
              No commits found.
            </div>
          ) : (
            <div style={{ height: totalHeight, position: 'relative' }}>
              <div
                className="absolute top-0 z-30 pointer-events-none"
                style={{ left: refRailWidth, width: graphWidth, transform: `translateY(${offsetY}px)` }}
              >
                <GraphCanvas
                  allRows={rows}
                  rows={visibleRows}
                  firstRow={firstRow}
                  offsetY={0}
                  graphWidth={graphWidth}
                  rowHeight={rowHeight}
                  density={density}
                  selectedSha={selectedSha ?? undefined}
                  hasWip={hasWip}
                />
              </div>
              <div
                className="absolute left-0 right-0"
                style={{ transform: `translateY(${offsetY}px)` }}
              >
                {visibleRows.map((row) => (
                  <div
                    key={row.sha}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setContextMenu({ x: e.clientX, y: e.clientY, commit: row.commit });
                    }}
                  >
                    <GraphRow
                      row={row}
                      graphWidth={graphWidth}
                      selected={row.sha === selectedSha}
                      onClick={() => openCommitDetails(row.sha)}
                      density={density}
                      rowHeight={rowHeight}
                      onRefContext={handleRefContext}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-50 bg-bg-panel border border-border rounded shadow-xl py-1 w-48 text-xs select-none"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg transition-colors"
            onClick={() => {
              void checkout.mutate({ ref: contextMenu.commit.sha });
              setContextMenu(null);
            }}
          >
            Checkout Commit ({contextMenu.commit.sha.slice(0, 7)})
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg transition-colors"
            onClick={() => {
              setCreateBranchAtCommit(contextMenu.commit);
              setNewBranchName('');
              setContextMenu(null);
            }}
          >
            Create Branch Here...
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg transition-colors"
            onClick={() => {
              void cherryPick.mutate({ shas: [contextMenu.commit.sha] });
              setContextMenu(null);
            }}
          >
            Cherry-pick Commit
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg transition-colors"
            onClick={() => {
              void revert.mutate({ shas: [contextMenu.commit.sha] });
              setContextMenu(null);
            }}
          >
            Revert Commit
          </button>
          {contextMenu.commit.refs.some((r) => r.isHead && r.kind === 'local') && (
            <>
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg transition-colors"
                onClick={() => {
                  setResetConfirmCommit(contextMenu.commit);
                  setResetMode('mixed');
                  setContextMenu(null);
                }}
              >
                Reset Current Branch to Here...
              </button>
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg transition-colors"
                onClick={() => {
                  void rebase.mutate({ onto: contextMenu.commit.sha });
                  setContextMenu(null);
                }}
              >
                Rebase Current Branch onto Here...
              </button>
              <button
                className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg transition-colors"
                onClick={() => {
                  setMergeConfirmCommit(contextMenu.commit);
                  setContextMenu(null);
                }}
              >
                Merge into Current Branch...
              </button>
            </>
          )}
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg transition-colors"
            onClick={() => {
              openCommitDetails(contextMenu.commit.sha);
              setContextMenu(null);
            }}
          >
            Diff with HEAD
          </button>
          <div className="border-t border-border my-1" />
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg transition-colors"
            onClick={() => {
              void navigator.clipboard.writeText(contextMenu.commit.sha);
              setContextMenu(null);
            }}
          >
            Copy SHA
          </button>
        </div>
      )}

      {refCtx && (
        <div className="fixed z-50 bg-bg-panel border border-border rounded shadow-xl py-1 w-48 text-xs" style={{ left: refCtx.x, top: refCtx.y }} onClick={(e) => e.stopPropagation()}>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg flex items-center gap-2"
            onClick={() => { useGraphFilterStore.getState().solo(refCtx.ref.shortName); setRefCtx(null); }}
          >
            <Eye className="w-3 h-3" /> Solo this branch
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-bg-hover text-fg flex items-center gap-2"
            onClick={() => { useGraphFilterStore.getState().mute(refCtx.ref.shortName); setRefCtx(null); }}
          >
            <EyeOff className="w-3 h-3" /> Mute this branch
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!createBranchAtCommit}
        title="Create Branch Here"
        message={`Create a new branch starting at commit ${createBranchAtCommit?.sha.slice(0, 7)}?`}
        confirmLabel="Create Branch"
        onConfirm={() => {
          if (createBranchAtCommit && newBranchName.trim()) {
            void createBranch.mutate({
              name: newBranchName.trim(),
              start: createBranchAtCommit.sha,
              checkout: true,
            });
            setCreateBranchAtCommit(null);
          }
        }}
        onCancel={() => setCreateBranchAtCommit(null)}
      >
        <input
          className="input w-full mt-2"
          placeholder="Enter branch name..."
          value={newBranchName}
          onChange={(e) => setNewBranchName(e.target.value)}
          autoFocus
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={!!resetConfirmCommit}
        title="Reset Branch"
        message={`Reset current branch to commit ${resetConfirmCommit?.sha.slice(0, 7)}?`}
        confirmLabel={`Reset (${resetMode})`}
        danger={resetMode === 'hard'}
        onConfirm={() => {
          if (resetConfirmCommit) {
            void reset.mutate({ ref: resetConfirmCommit.sha, mode: resetMode });
            setResetConfirmCommit(null);
          }
        }}
        onCancel={() => setResetConfirmCommit(null)}
      >
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-fg-muted">Mode:</span>
          {(['soft', 'mixed', 'hard'] as const).map((m) => (
            <button
              key={m}
              className={`text-xs px-2 py-0.5 rounded capitalize transition-colors ${resetMode === m ? 'bg-accent/20 text-accent font-semibold' : 'text-fg-muted hover:bg-bg-hover'}`}
              onClick={() => setResetMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!mergeConfirmCommit}
        title="Merge"
        message={`Merge commit ${mergeConfirmCommit?.sha.slice(0, 7)} into the current branch?`}
        confirmLabel="Merge"
        onConfirm={() => {
          if (mergeConfirmCommit) {
            void merge.mutate({ ref: mergeConfirmCommit.sha });
            setMergeConfirmCommit(null);
          }
        }}
        onCancel={() => setMergeConfirmCommit(null)}
      />
    </div>
  );
}

interface GraphCanvasProps {
  allRows: GraphLayoutRow[];
  rows: GraphLayoutRow[];
  firstRow: number;
  offsetY: number;
  graphWidth: number;
  rowHeight: number;
  density: Density;
  selectedSha?: string;
  hasWip: boolean;
}

function WipGraphRow({
  graphWidth,
  rowHeight,
  density,
  lane,
  colorKey,
  additions,
  modifications,
  onClick,
}: {
  graphWidth: number;
  rowHeight: number;
  density: Density;
  lane: number;
  colorKey: string;
  additions: number;
  modifications: number;
  onClick: () => void;
}) {
  const x = laneX(lane);
  const color = graphColorByKey(colorKey);

  const commitSummary = useRepoStore((s) => s.commitSummary);
  const setCommitSummary = useRepoStore((s) => s.setCommitSummary);
  const commit = useCommit();
  const status = useStatus();
  const hasStaged = (status.data?.entries ?? []).some((e) => e.staged);

  const handleGraphCommit = () => {
    const message = commitSummary.trim();
    if (!message || !hasStaged) return;
    commit.mutate(
      { message, amend: false, signoff: false, noVerify: false },
      {
        onSuccess: () => {
          setCommitSummary('');
          useToastStore.getState().addToast('Commit created successfully', 'success');
        },
        onError: (err) => {
          useToastStore.getState().addToast(`Commit failed: ${(err as Error).message}`, 'error');
        }
      }
    );
  };

  const isDetailed = density === 'detailed';
  const isCompact = density === 'compact';

  return (
    <div
      className="w-full text-left border-b border-border bg-gradient-to-r from-git-modified/10 via-accent/5 to-transparent hover:bg-bg-hover/60 transition-colors cursor-pointer"
      style={{ height: rowHeight, display: 'grid', gridTemplateColumns: graphRowTemplateColumns(graphWidth, density) }}
      onClick={onClick}
      title="Working tree changes — open commit panel"
    >
      <span />
      <svg width={graphWidth} height={rowHeight} aria-hidden="true">
        <line x1={x} x2={x} y1={rowHeight / 2} y2={rowHeight} stroke={color} strokeWidth="2" opacity="0.8" />
        <circle cx={x} cy={rowHeight / 2} r="8" fill="rgb(var(--color-bg-panel))" stroke={color} strokeWidth="2" strokeDasharray="2 2" />
      </svg>
      <div className="min-w-0 flex items-center gap-3 px-2 h-full" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          className="w-72 min-w-0 bg-bg-panel/80 hover:bg-bg-panel border border-border focus:border-accent text-fg text-xs rounded px-2.5 py-1 outline-none transition-colors"
          placeholder="Commit message (Summary)..."
          value={commitSummary}
          onChange={(e) => setCommitSummary(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleGraphCommit();
            }
          }}
          disabled={commit.isPending}
        />
        <span className="inline-flex items-center gap-2 text-xs font-semibold shrink-0 select-none">
          {modifications > 0 && <span className="text-git-modified">✎ {modifications}</span>}
          {additions > 0 && <span className="text-git-added">+ {additions}</span>}
        </span>
        <button
          className="btn btn-primary !px-2.5 !py-1 !text-xxs font-bold shrink-0 uppercase tracking-wider disabled:opacity-40"
          disabled={commit.isPending || !commitSummary.trim() || !hasStaged}
          onClick={handleGraphCommit}
          title={!hasStaged ? "Stage changes first to commit" : "Commit staged changes (Enter)"}
        >
          Commit
        </button>
      </div>

      {!isDetailed && <div />}

      {!isDetailed && <div />}

      {!isDetailed && !isCompact && <div />}

      {!isDetailed && !isCompact && <div />}
    </div>
  );
}

function GraphCanvas({ allRows, rows, firstRow, offsetY, graphWidth, rowHeight, density, selectedSha, hasWip }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dpr, setDpr] = useState(window.devicePixelRatio || 1);
  const lastDrawKeyRef = useRef('');

  useEffect(() => {
    const onDpr = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener('resize', onDpr);
    return () => window.removeEventListener('resize', onDpr);
  }, []);

  useEffect(() => {
    const drawKey = `${firstRow}:${rows.length}:${graphWidth}:${dpr}:${rowHeight}:${density}:${selectedSha ?? ''}:${hasWip}`;
    if (drawKey === lastDrawKeyRef.current) return;
    lastDrawKeyRef.current = drawKey;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const height = rows.length * rowHeight + rowHeight;
    canvas.width = graphWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${graphWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, graphWidth, height);

    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim() || '#0d1117';
    const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '#3b82f6';
    const headColor = getComputedStyle(document.documentElement).getPropertyValue('--color-git-head').trim() || '#3fb950';

    // Build the set of all parent SHAs to identify if a commit has children in the visible list
    const parentShas = new Set<string>();
    for (const r of allRows) {
      for (const p of r.commit.parents) {
        parentShas.add(p);
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const yTop = i * rowHeight;
      const yCenter = yTop + rowHeight / 2;
      const yBottom = yTop + rowHeight;

      // 1. Draw passing lines (active lanes that are NOT this commit node's lane)
      for (const lane of row.activeLanes) {
        if (lane === row.node.lane) continue;
        ctx.strokeStyle = colorWithAlpha(colorForLane(row, lane), 0.72);
        ctx.lineWidth = 2.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(laneX(lane), yTop);
        ctx.lineTo(laneX(lane), yBottom);
        ctx.stroke();
      }

      // 2. Draw incoming line to node (from yTop to yCenter) in the node's lane
      if (parentShas.has(row.sha) || (hasWip && firstRow === 0 && i === 0)) {
        ctx.strokeStyle = colorWithAlpha(graphColorByKey(row.node.colorKey), 0.72);
        ctx.lineWidth = 2.0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(laneX(row.node.lane), yTop);
        ctx.lineTo(laneX(row.node.lane), yCenter);
        ctx.stroke();
      }

      // 3. Draw outgoing edges (from yCenter to yBottom)
      for (const edge of row.edges) {
        ctx.strokeStyle = colorWithAlpha(graphColorByKey(edge.colorKey), 0.85);
        ctx.lineWidth = 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (edge.toLane === edge.fromLane) {
          // Straight down to parent
          ctx.moveTo(laneX(edge.fromLane), yCenter);
          ctx.lineTo(laneX(edge.fromLane), yBottom);
        } else {
          // Beautiful smooth S-curve to parent lane at the bottom of the row
          const curveHeight = rowHeight * 0.25;
          ctx.moveTo(laneX(edge.fromLane), yCenter);
          ctx.bezierCurveTo(
            laneX(edge.fromLane),
            yCenter + curveHeight,
            laneX(edge.toLane),
            yBottom - curveHeight,
            laneX(edge.toLane),
            yBottom
          );
        }
        ctx.stroke();
      }

      // 4. Draw Commit Node (GitKraken-style beautiful sleek dot styling)
      const nodeX = laneX(row.node.lane);
      const isMerge = row.node.kind === 'merge';
      const isHead = row.node.kind === 'head' || row.node.kind === 'detached-head';
      const isSelected = row.sha === selectedSha;
      const color = graphColorByKey(row.node.colorKey);
      
      const baseRadius = density === 'compact' ? 4 : density === 'comfortable' ? 5 : 6;

      // Draw Selected Halo/Glow
      if (isSelected) {
        ctx.beginPath();
        ctx.arc(nodeX, yCenter, baseRadius + 5, 0, Math.PI * 2);
        ctx.fillStyle = colorWithAlpha(accentColor, 0.22);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(nodeX, yCenter, baseRadius + 4, 0, Math.PI * 2);
        ctx.strokeStyle = colorWithAlpha(accentColor, 0.85);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Draw HEAD border indicator
      if (isHead) {
        ctx.beginPath();
        ctx.arc(nodeX, yCenter, baseRadius + 3, 0, Math.PI * 2);
        ctx.strokeStyle = colorWithAlpha(headColor, 0.9);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw dot body
      if (isMerge) {
        // Hollow circle/ring for merge commits
        ctx.beginPath();
        ctx.arc(nodeX, yCenter, baseRadius + 1, 0, Math.PI * 2);
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(nodeX, yCenter, baseRadius - 2, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      } else {
        // Solid dot with clean bg border
        ctx.beginPath();
        ctx.arc(nodeX, yCenter, baseRadius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(nodeX, yCenter, baseRadius, 0, Math.PI * 2);
        ctx.strokeStyle = bgColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }, [allRows, rows, firstRow, graphWidth, dpr, rowHeight, density, selectedSha, hasWip]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 pointer-events-none"
      style={{ transform: `translateY(${offsetY}px)` }}
    />
  );
}

function colorForLane(row: GraphLayoutRow, lane: number): string {
  if (lane === row.node.lane) return graphColorByKey(row.node.colorKey);
  const incoming = row.edges.find((edge) => edge.toLane === lane);
  if (incoming) return graphColorByKey(incoming.colorKey);
  const outgoing = row.edges.find((edge) => edge.fromLane === lane);
  if (outgoing) return graphColorByKey(outgoing.colorKey);
  return laneColorByIndex(lane);
}

function laneX(lane: number): number {
  return GRAPH_LANE_PADDING + lane * GRAPH_LANE_WIDTH + GRAPH_LANE_WIDTH / 2;
}

interface GraphRowProps {
  row: GraphLayoutRow;
  graphWidth: number;
  selected: boolean;
  onClick: () => void;
  density: Density;
  rowHeight: number;
  onRefContext: (e: React.MouseEvent, ref: RefLabel) => void;
}

function GraphRow({ row, graphWidth, selected, onClick, density, rowHeight, onRefContext }: GraphRowProps) {
  const commit = row.commit;
  const date = new Date(commit.author.date);
  const shortSha = commit.sha.slice(0, 7);
  const mutedRefs = useGraphFilterStore((s) => s.mutedRefs);
  const author = authorVisual(commit.author.name, commit.author.email);

  const isDetailed = density === 'detailed';
  const isCompact = density === 'compact';
  const templateColumns = graphRowTemplateColumns(graphWidth, density);
  const railWidth = graphRefRailWidth(density);
  const railInset = graphRefRailInset(density);
  const showInlineMeta = graphRowShowsInlineMeta(density);
  const rowBgClass = selected ? 'bg-accent/10' : 'bg-bg/80 hover:bg-bg-hover/90';
  const graphColBgClass = (selected ? 'bg-accent/10' : 'bg-bg hover:bg-bg-hover') + ' pointer-events-none';

  const visibleBranches = row.refs.branches.filter((ref) => !mutedRefs.includes(ref.shortName));
  const visibleTags = row.refs.tags.filter((ref) => !mutedRefs.includes(ref.shortName));
  const visibleRefs = [...visibleBranches, ...visibleTags];
  const MAX_VISIBLE = graphRowMaxVisibleRefs(density);
  const overflow = visibleRefs.length - MAX_VISIBLE;

  return (
    <div
      data-graph-row
      onClick={onClick}
      className={`grid items-center border-b border-border-subtle/50 cursor-pointer ${rowBgClass}`}
      style={{ height: rowHeight, gridTemplateColumns: templateColumns }}
    >
      <div
        className={`sticky left-0 z-30 h-full flex items-center justify-end pr-3 ${rowBgClass}`}
        style={{ width: railWidth, paddingLeft: railInset }}
      >
        <div className="min-w-0 w-full flex flex-wrap items-center justify-end gap-1 overflow-hidden py-1">
          {row.refs.head && <HeadIndicator label={row.refs.head} />}
          {visibleRefs.slice(0, MAX_VISIBLE).map((ref) =>
            ref.kind === 'tag' ? (
              <TagBadge key={`tag:${ref.shortName}`} label={ref} onContextMenu={(e) => onRefContext(e, ref)} />
            ) : (
              <BranchBadge key={`${ref.kind}:${ref.shortName}`} label={ref} onContextMenu={(e) => onRefContext(e, ref)} />
            ),
          )}
          {overflow > 0 && (
            <span className="px-1.5 py-0 rounded text-xxs text-fg-muted bg-bg-elevated font-mono shrink-0">
              +{overflow}
            </span>
          )}
        </div>
      </div>

      <div className={`sticky z-20 h-full ${graphColBgClass}`} style={{ left: railWidth }} />

      <div className="min-w-0 flex items-center gap-2 px-2">
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            <span
              className="inline-flex w-5 h-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
              style={{ backgroundColor: author.fill }}
              title={`${commit.author.name} <${commit.author.email}>`}
            >
              {author.initials}
            </span>
            <span className={`truncate min-w-0 ${isCompact ? 'text-xs' : 'text-sm'} text-fg ${selected ? '' : 'font-medium'}`}>
              {commit.subject}
            </span>
          </div>

          {showInlineMeta && (
            <div className="flex items-center gap-2 text-xxs text-fg-muted min-w-0">
              <span className="truncate">{commit.author.name}</span>
              <span>·</span>
              <span className="tabular-nums">{formatDate(date)}</span>
              <span>·</span>
              <span className="font-mono text-fg-dim">{shortSha}</span>
            </div>
          )}
        </div>

      </div>

      {!isDetailed && !isCompact && (
        <div className="min-w-0 px-2 text-xs text-fg-muted truncate">{commit.author.name}</div>
      )}

      {!isDetailed && (
        <div className={`min-w-0 px-2 text-fg-dim text-right tabular-nums ${isCompact ? 'text-xxs' : 'text-xs'}`}>{formatDate(date)}</div>
      )}

      {!isDetailed && !isCompact && (
        <div className="min-w-0 px-2 text-xs text-fg-dim font-mono text-right">{shortSha}</div>
      )}

      {!isDetailed && <div />}
    </div>
  );
}

function GraphError({ error, qc }: { error: unknown; qc: ReturnType<typeof useQueryClient> }) {
  const gitErr = GitError.is(error) ? GitError.fromSerialized(error) : null;
  const isOwnership = gitErr?.code === 'NotARepo' && (gitErr.stderr || gitErr.friendly).toLowerCase().includes('dubious ownership');
  const [trusting, setTrusting] = useState(false);

  if (!isOwnership) {
    return (
      <PaneErrorState
        title="Failed to load commits"
        message={gitErr?.friendly || gitErr?.message || (error as Error).message}
        onRetry={() => void qc.invalidateQueries({ queryKey: ['log'] })}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-git-deleted text-sm gap-3 p-6 text-center">
      {isOwnership ? <ShieldAlert className="w-8 h-8 text-git-modified" /> : <GitCommit className="w-8 h-8 text-fg-dim" />}
      <div className="max-w-md">
        <p className="font-semibold mb-1">{isOwnership ? 'Repository ownership issue' : 'Failed to load commits'}</p>
        <p className="text-xs text-fg-muted">{gitErr?.friendly || gitErr?.message || (error as Error).message}</p>
        {isOwnership && gitErr.command && (
          <p className="text-xxs text-fg-dim mt-2 font-mono break-all">{gitErr.command}</p>
        )}
      </div>
      {isOwnership && (
        <button
          className="btn btn-primary text-xs"
          disabled={trusting}
          onClick={async () => {
            setTrusting(true);
            try {
              await api.repo.trust();
              await qc.invalidateQueries({ queryKey: ['log'] });
              await qc.invalidateQueries({ queryKey: ['branches'] });
            } catch (err) {
              console.error('trust failed', err);
            } finally {
              setTrusting(false);
            }
          }}
        >
          {trusting ? 'Adding safe.directory…' : 'Trust this repository & retry'}
        </button>
      )}
    </div>
  );
}

function formatDate(d: Date): string {
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const opts: Intl.DateTimeFormatOptions = sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}

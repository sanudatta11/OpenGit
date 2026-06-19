import { useEffect, useMemo, useRef, useState } from 'react';
import type { Commit, RefLabel } from '@shared/git';
import type { GraphRow as GraphLayoutRow } from '../../graph/layout';
import { useLog } from '../../queries/useRepo';
import { useRepoStore, cacheCommits } from '../../stores/repo';
import { useGraphFilterStore } from '../../stores/graphFilter';
import { compileGraphLayout } from '../../graph/layout';
import { graphColorByKey, laneColorByIndex } from '../../graph/colors';
import { GitCommit, Search, X, EyeOff, Eye, Clock } from 'lucide-react';
import { useCheckout, useCreateBranch, useCherryPick, useRevert, useReset, useRebase, useMerge } from '../../queries/useMutations';
import { ConfirmDialog } from '../ConfirmDialog';
import { BranchBadge } from './decorations/BranchBadge';
import { TagBadge } from './decorations/TagBadge';
import { HeadIndicator } from './decorations/HeadIndicator';

type Density = 'compact' | 'comfortable' | 'detailed';

const LANE_WIDTH = 20;
const LANE_PADDING = 18;
const DOT_RADIUS = 4;
const BUFFER_ROWS = 30;

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
  const selectedSha = useRepoStore((s) => s.selectedCommitSha);
  const selectCommit = useRepoStore((s) => s.selectCommit);
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
  const [zoom, setZoom] = useState(1.0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  const checkout = useCheckout();
  const createBranch = useCreateBranch();
  const cherryPick = useCherryPick();
  const revert = useRevert();
  const reset = useReset();
  const rebase = useRebase();
  const merge = useMerge();

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
  const rowHeight = density === 'compact' ? 24 : density === 'detailed' ? 42 : 32;

  useEffect(() => {
    if (log.data?.commits) cacheCommits(log.data.commits);
  }, [log.data]);

  useEffect(() => {
    const close = () => setContextMenu(null);
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
  const graphWidth = Math.max(88, (layout.maxLane + 1) * LANE_WIDTH + LANE_PADDING * 2);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((prev) => Math.min(2, Math.max(0.5, prev + (e.deltaY > 0 ? -0.1 : 0.1))));
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    setScrollTop(el.scrollTop);
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) {
      if (log.data?.hasMore && !log.isFetching) {
        setLimit((prev) => prev + 200);
      }
    }
  };

  if (log.isLoading && limit === 200) {
    return <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">Loading commits…</div>;
  }
  if (log.error) {
    return <div className="flex-1 flex items-center justify-center text-git-deleted text-sm">{(log.error as Error).message}</div>;
  }

  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_ROWS);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + BUFFER_ROWS * 2;
  const lastRow = Math.min(rows.length, firstRow + visibleCount);
  const visibleRows = rows.slice(firstRow, lastRow);
  const offsetY = firstRow * rowHeight;

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
          <span className="text-xxs text-fg-muted mr-1">Density:</span>
          {(['compact', 'comfortable', 'detailed'] as Density[]).map((d) => (
            <button
              key={d}
              className={`text-xxs px-2 py-0.5 rounded capitalize transition-colors ${density === d ? 'bg-accent/20 text-accent font-semibold' : 'text-fg-muted hover:bg-bg-hover'}`}
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
        <div className="border-b border-accent/30 bg-accent/5 px-3 py-1.5 flex items-center gap-2 shrink-0 text-xxs animate-slide-down">
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
          <button className="icon-btn !w-5 !h-5" onClick={clearAllFilters} title="Clear all filters">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {fileHistoryPath && (
        <div className="border-b border-accent/30 bg-accent/5 px-3 py-1.5 flex items-center gap-2 shrink-0 text-xxs">
          <Clock className="w-3 h-3 text-accent shrink-0" />
          <span className="text-fg-muted flex-1">File history: <span className="font-mono text-fg">{fileHistoryPath}</span></span>
          <button className="icon-btn !w-5 !h-5" onClick={() => setFileHistory(null)} title="Clear file history">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div
        ref={containerRef}
        className="flex-1 min-w-0 overflow-auto relative"
        onScroll={handleScroll}
        onWheel={handleWheel}
      >
        <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
          {rows.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-fg-muted text-sm gap-2">
              <GitCommit className="w-8 h-8 text-fg-dim" />
              No commits found.
            </div>
          ) : (
            <div style={{ height: totalHeight, position: 'relative' }}>
              <GraphCanvas
                rows={visibleRows}
                offsetY={offsetY}
                graphWidth={graphWidth}
                rowHeight={rowHeight}
                selectedSha={selectedSha ?? undefined}
              />
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
                      onClick={() => selectCommit(row.sha)}
                      density={density}
                      rowHeight={rowHeight}
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
              selectCommit(contextMenu.commit.sha);
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
  rows: GraphLayoutRow[];
  offsetY: number;
  graphWidth: number;
  rowHeight: number;
  selectedSha?: string;
}

function GraphCanvas({ rows, offsetY, graphWidth, rowHeight, selectedSha }: GraphCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dpr, setDpr] = useState(window.devicePixelRatio || 1);

  useEffect(() => {
    const onDpr = () => setDpr(window.devicePixelRatio || 1);
    window.addEventListener('resize', onDpr);
    return () => window.removeEventListener('resize', onDpr);
  }, []);

  useEffect(() => {
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

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      const yTop = i * rowHeight;
      const yCenter = yTop + rowHeight / 2;
      const yBottom = yTop + rowHeight;

      for (const lane of row.activeLanes) {
        ctx.strokeStyle = colorForLane(row, lane);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(laneX(lane), yTop);
        ctx.lineTo(laneX(lane), yBottom);
        ctx.stroke();
      }

      for (const edge of row.edges) {
        if (edge.kind === 'vertical') continue;
        ctx.strokeStyle = graphColorByKey(edge.colorKey);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(laneX(edge.fromLane), yCenter);
        ctx.bezierCurveTo(
          laneX(edge.fromLane),
          yCenter + rowHeight / 2,
          laneX(edge.toLane),
          yBottom - rowHeight / 2,
          laneX(edge.toLane),
          yBottom,
        );
        ctx.stroke();
      }

      const nodeX = laneX(row.node.lane);
      const isMerge = row.node.kind === 'merge';
      const isHead = row.node.kind === 'head' || row.node.kind === 'detached-head';
      const isSelected = row.sha === selectedSha;
      const radius = isMerge ? DOT_RADIUS + 2 : DOT_RADIUS;
      const color = graphColorByKey(row.node.colorKey);

      ctx.beginPath();
      ctx.arc(nodeX, yCenter, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      ctx.strokeStyle = bgColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      if (isHead) {
        ctx.beginPath();
        ctx.arc(nodeX, yCenter, radius + 2, 0, Math.PI * 2);
        ctx.strokeStyle = headColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (isSelected) {
        ctx.beginPath();
        ctx.arc(nodeX, yCenter, radius + (isHead ? 4 : 2), 0, Math.PI * 2);
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, [rows, graphWidth, dpr, rowHeight, selectedSha]);

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
  return LANE_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;
}

interface GraphRowProps {
  row: GraphLayoutRow;
  graphWidth: number;
  selected: boolean;
  onClick: () => void;
  density: Density;
  rowHeight: number;
}

function GraphRow({ row, graphWidth, selected, onClick, density, rowHeight }: GraphRowProps) {
  const commit = row.commit;
  const date = new Date(commit.author.date);
  const shortSha = commit.sha.slice(0, 7);
  const [refCtx, setRefCtx] = useState<{ x: number; y: number; ref: RefLabel } | null>(null);
  const mutedRefs = useGraphFilterStore((s) => s.mutedRefs);

  const isDetailed = density === 'detailed';
  const isCompact = density === 'compact';

  useEffect(() => {
    const close = () => setRefCtx(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, []);

  const visibleBranches = row.refs.branches.filter((ref) => !mutedRefs.includes(ref.shortName));
  const visibleTags = row.refs.tags.filter((ref) => !mutedRefs.includes(ref.shortName));
  const visibleRefs = [...visibleBranches, ...visibleTags];
  const MAX_VISIBLE = 6;
  const overflow = visibleRefs.length - MAX_VISIBLE;

  const handleRefContext = (e: React.MouseEvent, ref: RefLabel) => {
    e.preventDefault();
    e.stopPropagation();
    setRefCtx({ x: e.clientX, y: e.clientY, ref });
  };

  return (
    <div
      data-graph-row
      onClick={onClick}
      className={`flex items-center border-b border-border-subtle/50 cursor-pointer ${selected ? 'bg-accent/10' : 'row-hover'}`}
      style={{ height: rowHeight }}
    >
      <div style={{ width: graphWidth, flexShrink: 0 }} />

      <div className="flex-1 min-w-0 flex items-center gap-3 pr-3">
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`truncate ${isCompact ? 'text-xs' : 'text-sm'} ${selected ? 'text-fg' : 'text-fg font-medium'}`}>
              {commit.subject}
            </span>
            {row.refs.head && <HeadIndicator label={row.refs.head} />}
            {visibleRefs.slice(0, MAX_VISIBLE).map((ref) =>
              ref.kind === 'tag' ? (
                <TagBadge key={`tag:${ref.shortName}`} label={ref} onContextMenu={(e) => handleRefContext(e, ref)} />
              ) : (
                <BranchBadge key={`${ref.kind}:${ref.shortName}`} label={ref} onContextMenu={(e) => handleRefContext(e, ref)} />
              ),
            )}
            {overflow > 0 && (
              <span className="px-1.5 py-0 rounded text-xxs text-fg-muted bg-bg-elevated font-mono shrink-0">
                +{overflow}
              </span>
            )}
          </div>

          {!isCompact && (
            <div className="flex items-center gap-2 text-xxs text-fg-muted min-w-0">
              <span className="truncate">{commit.author.name}</span>
              <span>·</span>
              <span className="tabular-nums">{formatDate(date)}</span>
              {isDetailed && (
                <>
                  <span>·</span>
                  <span className="font-mono text-fg-dim">{shortSha}</span>
                </>
              )}
            </div>
          )}
        </div>

        {!isDetailed && (
          <>
            <div className={`hidden xl:block w-28 shrink-0 px-2 text-fg-muted truncate ${isCompact ? 'text-xxs' : 'text-xs'}`}>{commit.author.name}</div>
            <div className={`hidden lg:block w-20 shrink-0 px-2 text-fg-dim text-right tabular-nums ${isCompact ? 'text-xxs' : 'text-xs'}`}>{formatDate(date)}</div>
            <div className={`hidden xl:block w-16 shrink-0 px-2 text-fg-dim font-mono text-right ${isCompact ? 'text-xxs' : 'text-xs'}`}>{shortSha}</div>
          </>
        )}
      </div>

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

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLog } from '../../queries/useRepo';
import { useRepoStore, cacheCommits } from '../../stores/repo';
import { assignLanes } from '../../graph/lane';
import { laneColorByIndex } from '../../graph/colors';
import type { Commit } from '@shared/git';
import { GitCommit, Search, X } from 'lucide-react';
import { useCheckout, useCreateBranch, useCherryPick, useRevert, useReset, useRebase, useMerge } from '../../queries/useMutations';
import { ConfirmDialog } from '../ConfirmDialog';

type Density = 'compact' | 'comfortable' | 'detailed';

const LANE_WIDTH = 24;
const LANE_PADDING = 14;
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
  const [limit, setLimit] = useState(200);
  const [searchQuery, setSearchQuery] = useState('');
  const [density, setDensity] = useState<Density>('comfortable');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; commit: Commit } | null>(null);
  const [createBranchAtCommit, setCreateBranchAtCommit] = useState<Commit | null>(null);
  const [newBranchName, setNewBranchName] = useState('');
  const [resetConfirmCommit, setResetConfirmCommit] = useState<Commit | null>(null);
  const [resetMode, setResetMode] = useState<'soft' | 'mixed' | 'hard'>('mixed');
  const [mergeConfirmCommit, setMergeConfirmCommit] = useState<Commit | null>(null);

  const checkout = useCheckout();
  const createBranch = useCreateBranch();
  const cherryPick = useCherryPick();
  const revert = useRevert();
  const reset = useReset();
  const rebase = useRebase();
  const merge = useMerge();

  const parsed = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);
  const paths = useMemo(() => (parsed.file ? [parsed.file] : undefined), [parsed.file]);

  const log = useLog(undefined, 0, limit, paths);

  const rowHeight = density === 'compact' ? 20 : density === 'detailed' ? 36 : 28;

  useEffect(() => {
    if (log.data?.commits) cacheCommits(log.data.commits);
  }, [log.data]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
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

  const assigned = useMemo(() => {
    if (filteredCommits.length === 0) return null;
    const clones = filteredCommits.map((c) => ({ ...c, lane: -1, parentLanes: [] }));
    return assignLanes(clones);
  }, [filteredCommits]);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewportHeight(el.clientHeight));
    ro.observe(el);
    setViewportHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

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

  const commits = assigned?.commits ?? [];
  const maxLaneUsed = assigned?.maxLaneUsed ?? 0;
  const totalHeight = commits.length * rowHeight;
  const graphWidth = (maxLaneUsed + 1) * LANE_WIDTH + LANE_PADDING * 2;

  // Virtualization window.
  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_ROWS);
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + BUFFER_ROWS * 2;
  const lastRow = Math.min(commits.length, firstRow + visibleCount);
  const visible = commits.slice(firstRow, lastRow);
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
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 min-w-0 overflow-auto relative"
        onScroll={handleScroll}
      >
        {commits.length === 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-fg-muted text-sm gap-2">
            <GitCommit className="w-8 h-8 text-fg-dim" />
            No commits found.
          </div>
        ) : (
          <div style={{ height: totalHeight, position: 'relative' }}>
            <GraphCanvas
              commits={visible}
              firstRow={firstRow}
              offsetY={offsetY}
              graphWidth={graphWidth}
              viewportHeight={viewportHeight}
              rowHeight={rowHeight}
            />
            <div
              className="absolute left-0 right-0"
              style={{ transform: `translateY(${offsetY}px)` }}
            >
              {visible.map((c, i) => (
                <div
                  key={c.sha}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({
                      x: e.clientX,
                      y: e.clientY,
                      commit: c,
                    });
                  }}
                >
                  <GraphRow
                    commit={c}
                    row={firstRow + i}
                    graphWidth={graphWidth}
                    selected={c.sha === selectedSha}
                    onClick={() => selectCommit(c.sha)}
                    density={density}
                    rowHeight={rowHeight}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
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
  commits: Commit[];
  firstRow: number;
  offsetY: number;
  graphWidth: number;
  viewportHeight: number;
  rowHeight: number;
}

function GraphCanvas({ commits, firstRow, offsetY, graphWidth, viewportHeight, rowHeight }: GraphCanvasProps) {
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

    const height = Math.min(commits.length * rowHeight + rowHeight, viewportHeight + rowHeight * 2);
    canvas.width = graphWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${graphWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, graphWidth, height);

    for (let i = 0; i < commits.length; i++) {
      const c = commits[i]!;
      const y = i * rowHeight + rowHeight / 2;
      const x = laneX(c.lane);
      const color = laneColorByIndex(c.lane);

      for (let p = 0; p < c.parents.length; p++) {
        const parentLane = c.parentLanes[p]!;
        const parentColor = laneColorByIndex(parentLane);
        const childY = y;
        const parentY = (i + 1) * rowHeight + rowHeight / 2;
        const parentX = laneX(parentLane);

        if (parentLane === c.lane) {
          if (i + 1 < commits.length) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, childY);
            ctx.lineTo(x, parentY);
            ctx.stroke();
          }
        } else {
          ctx.strokeStyle = parentColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, childY);
          ctx.bezierCurveTo(x, childY + rowHeight / 2, parentX, parentY - rowHeight / 2, parentX, parentY);
          ctx.stroke();
        }
      }
    }

    for (let i = 0; i < commits.length; i++) {
      const c = commits[i]!;
      const y = i * rowHeight + rowHeight / 2;
      const x = laneX(c.lane);
      const color = laneColorByIndex(c.lane);
      const isMerge = c.parents.length > 1;

      ctx.fillStyle = color;
      ctx.strokeStyle = '#0d1117';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, isMerge ? DOT_RADIUS + 1.5 : DOT_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, [commits, graphWidth, viewportHeight, dpr, rowHeight]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 pointer-events-none"
      style={{ transform: `translateY(${offsetY - firstRow * rowHeight}px)` }}
    />
  );
}

function laneX(lane: number): number {
  return LANE_PADDING + lane * LANE_WIDTH + LANE_WIDTH / 2;
}

interface GraphRowProps {
  commit: Commit;
  row: number;
  graphWidth: number;
  selected: boolean;
  onClick: () => void;
  density: Density;
  rowHeight: number;
}

function GraphRow({ commit, graphWidth, selected, onClick, density, rowHeight }: GraphRowProps) {
  const date = new Date(commit.author.date);
  const shortSha = commit.sha.slice(0, 7);
  const headRef = commit.refs.find((r) => r.isHead);

  const isDetailed = density === 'detailed';
  const isCompact = density === 'compact';

  return (
    <div
      onClick={onClick}
      className={`flex items-center border-b border-border-subtle/50 cursor-pointer ${
        selected ? 'bg-accent/10' : 'row-hover'
      }`}
      style={{ height: rowHeight }}
    >
      <div style={{ width: graphWidth, flexShrink: 0 }} />

      <div className="flex-1 min-w-0 flex flex-col justify-center pr-3">
        <div className="flex items-center gap-1.5 min-w-0">
          {headRef && (
            <span className="px-1.5 py-0 rounded text-xxs bg-git-head/20 text-git-head font-mono shrink-0">
              HEAD
            </span>
          )}
          {commit.refs.filter((r) => !r.isHead).slice(0, 3).map((r) => (
            <span
              key={`${r.kind}:${r.shortName}`}
              className={`px-1.5 py-0 rounded text-xxs font-mono shrink-0 ${refBadgeClass(r.kind)}`}
              title={r.shortName}
            >
              {r.shortName}
            </span>
          ))}
          <span className={`text-fg truncate ${isCompact ? 'text-xxs' : 'text-xs font-medium'}`}>{commit.subject}</span>
        </div>

        {isDetailed && (
          <div className="flex items-center gap-1.5 text-xxs text-fg-muted mt-0.5">
            <span className="truncate">{commit.author.name} ({commit.author.email})</span>
            <span>·</span>
            <span>{formatDate(date)}</span>
          </div>
        )}
      </div>

      {!isDetailed && !isCompact && (
        <div className="hidden xl:block w-32 shrink-0 px-2 text-xs text-fg-muted truncate">{commit.author.name}</div>
      )}

      {!isDetailed && (
        <div className={`hidden lg:block w-24 shrink-0 px-2 text-fg-dim text-right tabular-nums ${isCompact ? 'text-xxs' : 'text-xs'}`}>
          {formatDate(date)}
        </div>
      )}

      <div className={`hidden xl:block w-20 shrink-0 px-2 text-fg-dim font-mono text-right ${isCompact ? 'text-xxs' : 'text-xs'}`}>{shortSha}</div>
    </div>
  );
}

function refBadgeClass(kind: Commit['refs'][number]['kind']): string {
  switch (kind) {
    case 'local': return 'bg-git-branch/20 text-git-branch';
    case 'remote': return 'bg-git-remote/20 text-git-remote';
    case 'tag': return 'bg-git-tag/20 text-git-tag';
    default: return 'bg-bg-elevated text-fg-muted';
  }
}

function formatDate(d: Date): string {
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  const opts: Intl.DateTimeFormatOptions = sameYear
      ? { month: 'short', day: 'numeric' }
      : { month: 'short', day: 'numeric', year: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}

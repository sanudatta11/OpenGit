// src/components/graph/GraphPane.tsx — central commit graph (canvas lanes + virtualized DOM rows).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLog } from '../../queries/useRepo';
import { useRepoStore, cacheCommits } from '../../stores/repo';
import { assignLanes } from '../../graph/lane';
import { laneColorByIndex } from '../../graph/colors';
import type { Commit } from '@shared/git';
import { GitCommit } from 'lucide-react';

const ROW_HEIGHT = 28;
const LANE_WIDTH = 24;
const LANE_PADDING = 14;
const DOT_RADIUS = 4;
const BUFFER_ROWS = 30;

export function GraphPane() {
  const selectedSha = useRepoStore((s) => s.selectedCommitSha);
  const selectCommit = useRepoStore((s) => s.selectCommit);
  const log = useLog(undefined, 0, 1000);

  useEffect(() => {
    if (log.data?.commits) cacheCommits(log.data.commits);
  }, [log.data]);

  const assigned = useMemo(() => {
    if (!log.data?.commits) return null;
    // Clone so we can mutate lane/parentLanes without affecting cached data.
    const clones = log.data.commits.map((c) => ({ ...c, lane: -1, parentLanes: [] }));
    return assignLanes(clones);
  }, [log.data]);

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

  if (log.isLoading) {
    return <div className="flex-1 flex items-center justify-center text-fg-muted text-sm">Loading commits…</div>;
  }
  if (log.error) {
    return <div className="flex-1 flex items-center justify-center text-git-deleted text-sm">{(log.error as Error).message}</div>;
  }
  if (!assigned || assigned.commits.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-fg-muted text-sm gap-2">
        <GitCommit className="w-8 h-8 text-fg-dim" />
        No commits yet.
      </div>
    );
  }

  const { commits, maxLaneUsed } = assigned;
  const totalHeight = commits.length * ROW_HEIGHT;
  const graphWidth = (maxLaneUsed + 1) * LANE_WIDTH + LANE_PADDING * 2;

  // Virtualization window.
  const firstRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + BUFFER_ROWS * 2;
  const lastRow = Math.min(commits.length, firstRow + visibleCount);
  const visible = commits.slice(firstRow, lastRow);
  const offsetY = firstRow * ROW_HEIGHT;

  return (
    <div
      ref={containerRef}
      className="flex-1 min-w-0 overflow-y-auto bg-bg relative"
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        {/* Canvas for lanes */}
        <GraphCanvas
          commits={visible}
          firstRow={firstRow}
          offsetY={offsetY}
          graphWidth={graphWidth}
          viewportHeight={viewportHeight}
        />
        {/* DOM rows overlay */}
        <div
          className="absolute left-0 right-0"
          style={{ transform: `translateY(${offsetY}px)` }}
        >
          {visible.map((c, i) => (
            <GraphRow
              key={c.sha}
              commit={c}
              row={firstRow + i}
              graphWidth={graphWidth}
              selected={c.sha === selectedSha}
              onClick={() => selectCommit(c.sha)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface GraphCanvasProps {
  commits: Commit[];
  firstRow: number;
  offsetY: number;
  graphWidth: number;
  viewportHeight: number;
}

function GraphCanvas({ commits, firstRow, offsetY, graphWidth, viewportHeight }: GraphCanvasProps) {
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

    const height = Math.min(commits.length * ROW_HEIGHT + ROW_HEIGHT, viewportHeight + ROW_HEIGHT * 2);
    canvas.width = graphWidth * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${graphWidth}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, graphWidth, height);

    // Draw edges first (so dots sit on top).
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i]!;
      const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x = laneX(c.lane);
      const color = laneColorByIndex(c.lane);

      for (let p = 0; p < c.parents.length; p++) {
        const parentLane = c.parentLanes[p]!;
        const parentColor = laneColorByIndex(parentLane);
        const childY = y;
        const parentY = (i + 1) * ROW_HEIGHT + ROW_HEIGHT / 2;
        const parentX = laneX(parentLane);

        if (parentLane === c.lane) {
          // Straight vertical — but only draw if next row is in view.
          if (i + 1 < commits.length) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x, childY);
            ctx.lineTo(x, parentY);
            ctx.stroke();
          }
        } else {
          // Bezier curve from this lane to parent lane.
          ctx.strokeStyle = parentColor;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, childY);
          ctx.bezierCurveTo(x, childY + ROW_HEIGHT / 2, parentX, parentY - ROW_HEIGHT / 2, parentX, parentY);
          ctx.stroke();
        }
      }
    }

    // Draw dots.
    for (let i = 0; i < commits.length; i++) {
      const c = commits[i]!;
      const y = i * ROW_HEIGHT + ROW_HEIGHT / 2;
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
  }, [commits, graphWidth, viewportHeight, dpr]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 pointer-events-none"
      style={{ transform: `translateY(${offsetY - firstRow * ROW_HEIGHT}px)` }}
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
}

function GraphRow({ commit, graphWidth, selected, onClick }: GraphRowProps) {
  const date = new Date(commit.author.date);
  const shortSha = commit.sha.slice(0, 7);
  const headRef = commit.refs.find((r) => r.isHead);

  return (
    <div
      onClick={onClick}
      className={`flex items-center border-b border-border-subtle/50 ${
        selected ? 'bg-accent/10' : 'row-hover'
      }`}
      style={{ height: ROW_HEIGHT }}
    >
      {/* Spacer for graph area */}
      <div style={{ width: graphWidth, flexShrink: 0 }} />

      {/* Subject + ref labels */}
      <div className="flex-1 min-w-0 flex items-center gap-1.5 pr-3">
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
        <span className="text-xs text-fg truncate">{commit.subject}</span>
      </div>

      {/* Author */}
      <div className="w-32 shrink-0 px-2 text-xs text-fg-muted truncate">{commit.author.name}</div>

      {/* Date */}
      <div className="w-24 shrink-0 px-2 text-xs text-fg-dim text-right tabular-nums">
        {formatDate(date)}
      </div>

      {/* SHA */}
      <div className="w-20 shrink-0 px-2 text-xs text-fg-dim font-mono text-right">{shortSha}</div>
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

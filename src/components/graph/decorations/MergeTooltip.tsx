// src/components/graph/decorations/MergeTooltip.tsx
// Hover tooltip for merge commits showing source/target branch info.

import { useState, useRef, useEffect } from 'react';
import { GitMerge } from 'lucide-react';

interface MergeTooltipProps {
  commitSha: string;
  sourceBranch: string | null;
  targetBranch: string | null;
  subject: string;
  date: string;
  childLane: number;
  parentLanes: number[];
}

export function MergeTooltip({
  commitSha,
  sourceBranch,
  targetBranch,
  subject,
  date,
  parentLanes,
  childLane,
}: MergeTooltipProps) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const source = sourceBranch ?? `lane ${childLane}`;
  const target = targetBranch ?? (parentLanes.length > 1 ? `lane ${parentLanes[1]!}` : `lane ${parentLanes[0]!}`);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const row = el.closest('[data-graph-row]') as HTMLElement;
    if (!row) return;
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX + 12, y: e.clientY - 10 });
    };
    const onLeave = () => setPos(null);
    row.addEventListener('mousemove', onMove);
    row.addEventListener('mouseleave', onLeave);
    return () => {
      row.removeEventListener('mousemove', onMove);
      row.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  if (!pos) return null;

  return (
    <div
      ref={ref}
      className="fixed z-50 pointer-events-none bg-bg-panel border border-border rounded-lg shadow-xl px-3 py-2 text-xs min-w-[200px]"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="flex items-center gap-1.5 text-fg font-medium mb-1">
        <GitMerge className="w-3.5 h-3.5 text-git-tag" />
        Merge Commit
      </div>
      <div className="text-fg-muted space-y-0.5">
        <div>
          <span className="text-xxs uppercase tracking-wider">SHA</span>{' '}
          <span className="font-mono text-fg">{commitSha.slice(0, 7)}</span>
        </div>
        <div>
          <span className="text-xxs uppercase tracking-wider">Source</span>{' '}
          <span className="text-fg">{source}</span>
        </div>
        <div>
          <span className="text-xxs uppercase tracking-wider">Target</span>{' '}
          <span className="text-fg">{target}</span>
        </div>
        <div className="text-fg mt-1 max-w-[240px] truncate">{subject}</div>
        <div className="text-fg-dim text-xxs">{date}</div>
      </div>
    </div>
  );
}

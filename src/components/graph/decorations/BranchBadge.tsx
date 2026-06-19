// src/components/graph/decorations/BranchBadge.tsx
// Branch label chip displayed on graph rows.

import type { RefLabel } from '@shared/git';
import { refBadgeStyle } from './refStyles';

interface BranchBadgeProps {
  label: RefLabel;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function BranchBadge({ label, onContextMenu }: BranchBadgeProps) {
  if (!label) return null;
  const style = refBadgeStyle(label.kind);
  return (
    <span
      className={`inline-flex max-w-full min-w-0 items-center px-1.5 py-0 rounded text-xxs font-mono shrink cursor-pointer overflow-hidden ${style}`}
      title={`${label.shortName} (right-click to solo/mute)`}
      onContextMenu={onContextMenu}
    >
      <span
        className="block min-w-0 break-words leading-tight text-left"
        style={{
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflow: 'hidden',
        }}
      >
        {label.shortName}
      </span>
    </span>
  );
}

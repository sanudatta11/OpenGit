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
      className={`px-1.5 py-0 rounded text-xxs font-mono shrink-0 cursor-pointer ${style}`}
      title={`${label.shortName} (right-click to solo/mute)`}
      onContextMenu={onContextMenu}
    >
      {label.shortName}
    </span>
  );
}

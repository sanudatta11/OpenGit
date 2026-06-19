// src/components/graph/decorations/TagBadge.tsx
// Tag label chip — teal, tag-shaped, renders on graph rows.

import type { RefLabel } from '@shared/git';

interface TagBadgeProps {
  ref: RefLabel;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function TagBadge({ ref, onContextMenu }: TagBadgeProps) {
  return (
    <span
      className="px-1.5 py-0 rounded text-xxs bg-git-tag/20 text-git-tag font-mono shrink-0 cursor-pointer"
      title={`tag: ${ref.shortName} (right-click to solo/mute)`}
      onContextMenu={onContextMenu}
    >
      {ref.shortName}
    </span>
  );
}

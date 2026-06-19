// src/components/graph/decorations/TagBadge.tsx
// Tag label chip — teal, tag-shaped, renders on graph rows.

import type { RefLabel } from '@shared/git';

interface TagBadgeProps {
  label: RefLabel;
  onContextMenu: (e: React.MouseEvent) => void;
}

export function TagBadge({ label, onContextMenu }: TagBadgeProps) {
  if (!label) return null;
  return (
    <span
      className="inline-flex max-w-full min-w-0 items-center px-1.5 py-0 rounded text-xxs border border-git-tag/35 bg-git-tag/15 text-fg font-mono shrink cursor-pointer overflow-hidden"
      title={`tag: ${label.shortName} (right-click to solo/mute)`}
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

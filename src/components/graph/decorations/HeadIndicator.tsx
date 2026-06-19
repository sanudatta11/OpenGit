// src/components/graph/decorations/HeadIndicator.tsx
// HEAD / tracking branch indicator — green, displayed on graph rows.

import type { RefLabel } from '@shared/git';

interface HeadIndicatorProps {
  label: RefLabel;
}

export function HeadIndicator({ label }: HeadIndicatorProps) {
  if (!label) return null;
  const txt =
    label.kind === 'HEAD'
      ? 'HEAD'
      : label.kind === 'local'
        ? `HEAD (${label.shortName})`
        : label.shortName;

  return (
    <span className="inline-flex max-w-full min-w-0 items-center px-1.5 py-0 rounded text-xxs border border-git-head/35 bg-git-head/15 text-fg font-mono shrink overflow-hidden">
      <span
        className="block min-w-0 break-words leading-tight text-left"
        style={{
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: 2,
          overflow: 'hidden',
        }}
      >
        {txt}
      </span>
    </span>
  );
}

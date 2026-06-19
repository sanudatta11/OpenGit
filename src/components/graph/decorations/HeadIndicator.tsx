// src/components/graph/decorations/HeadIndicator.tsx
// HEAD / tracking branch indicator — green, displayed on graph rows.

import type { RefLabel } from '@shared/git';

interface HeadIndicatorProps {
  ref: RefLabel;
}

export function HeadIndicator({ ref }: HeadIndicatorProps) {
  const label =
    ref.kind === 'HEAD'
      ? 'HEAD'
      : ref.kind === 'local'
        ? `HEAD (${ref.shortName})`
        : ref.shortName;

  return (
    <span className="px-1.5 py-0 rounded text-xxs bg-git-head/20 text-git-head font-mono shrink-0">
      {label}
    </span>
  );
}

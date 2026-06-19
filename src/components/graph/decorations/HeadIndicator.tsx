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
    <span className="px-1.5 py-0 rounded text-xxs bg-git-head/20 text-git-head font-mono shrink-0">
      {txt}
    </span>
  );
}

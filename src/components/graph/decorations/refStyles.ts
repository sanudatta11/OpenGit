// src/components/graph/decorations/refStyles.ts
// Shared styling for branch/tag/remote ref badges.

import type { RefKind } from '@shared/git';

export function refBadgeStyle(kind: RefKind): string {
  switch (kind) {
    case 'local':
      return 'bg-git-branch/20 text-git-branch';
    case 'remote':
      return 'bg-git-remote/20 text-git-remote';
    case 'tag':
      return 'bg-git-tag/20 text-git-tag';
    default:
      return 'bg-bg-elevated text-fg-muted';
  }
}

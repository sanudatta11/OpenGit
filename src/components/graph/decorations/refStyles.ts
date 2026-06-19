// src/components/graph/decorations/refStyles.ts
// Shared styling for branch/tag/remote ref badges.

import type { RefKind } from '@shared/git';

export function refBadgeStyle(kind: RefKind): string {
  switch (kind) {
    case 'local':
      return 'border border-git-branch/35 bg-git-branch/15 text-fg';
    case 'remote':
      return 'border border-git-remote/35 bg-git-remote/15 text-fg';
    case 'tag':
      return 'border border-git-tag/35 bg-git-tag/15 text-fg';
    default:
      return 'border border-border bg-bg-elevated text-fg-muted';
  }
}

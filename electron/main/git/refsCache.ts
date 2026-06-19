// electron/main/git/refsCache.ts — in-process cache for branch/tag/remote refs.
// Invalidated by the watcher's 'refs' event (chokidar on .git/refs/).

import type { Branch, RefLabel } from '@shared/git';
import { getBranches } from './repo';

interface CachedRefs {
  branches: Branch[];
  refsBySha: Map<string, RefLabel[]>;
  headSha: string | null;
}

let cache: CachedRefs | null = null;

export function getCachedRefs(): CachedRefs | null {
  return cache;
}

export async function fetchRefs(workTree: string, gitDir: string): Promise<CachedRefs> {
  const { branches, refsBySha, currentHeadSha } = await getBranches(workTree, gitDir);
  cache = { branches, refsBySha, headSha: currentHeadSha };
  return cache;
}

export function invalidateCache(): void {
  cache = null;
}

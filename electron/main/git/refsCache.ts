// electron/main/git/refsCache.ts — in-process cache for branch/tag/remote refs.
// Invalidated by the watcher's 'refs' event (chokidar on .git/refs/).
// Per-repo: cached by repo path, invalidated globally on any ref change.

import type { Branch, RefLabel } from '@shared/git';
import { getBranches } from './repo';

interface CachedRefs {
  branches: Branch[];
  refsBySha: Map<string, RefLabel[]>;
  headSha: string | null;
}

const cache = new Map<string, CachedRefs>();

export function getCachedRefs(repoPath: string): CachedRefs | null {
  return cache.get(repoPath) ?? null;
}

export async function fetchRefs(workTree: string, gitDir: string, repoPath: string): Promise<CachedRefs> {
  const { branches, refsBySha, currentHeadSha } = await getBranches(workTree, gitDir);
  const entry = { branches, refsBySha, headSha: currentHeadSha };
  cache.set(repoPath, entry);
  return entry;
}

export function invalidateCache(): void {
  cache.clear();
}

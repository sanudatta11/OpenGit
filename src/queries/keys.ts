// src/queries/keys.ts — TanStack Query key factories.

export const qk = {
  repo: ['repo'] as const,
  status: ['status'] as const,
  branches: ['branches'] as const,
  remotes: ['remotes'] as const,
  state: ['state'] as const,
  log: (range: string | undefined, skip: number, limit: number, paths?: string[]) =>
    ['log', { range, skip, limit, paths }] as const,
  commitFiles: (sha: string) => ['commitFiles', sha] as const,
  diff: (path: string, ref: string | undefined, base: string | undefined) =>
    ['diff', { path, ref, base }] as const,
  fileContent: (path: string, ref: string | undefined) =>
    ['fileContent', { path, ref }] as const,
  branchCompare: (branchA: string | null, branchB: string | null) =>
    ['branchCompare', branchA, branchB] as const,
};

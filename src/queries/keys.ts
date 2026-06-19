// src/queries/keys.ts — TanStack Query key factories (per-repo aware).

export const qk = {
  repo: ['repo'] as const,
  status: (repoPath: string | null) => ['status', repoPath] as const,
  branches: (repoPath: string | null) => ['branches', repoPath] as const,
  remotes: (repoPath: string | null) => ['remotes', repoPath] as const,
  state: (repoPath: string | null) => ['state', repoPath] as const,
  log: (range: string | undefined, skip: number, limit: number, paths: string[] | undefined, repoPath: string | null) =>
    ['log', { range, skip, limit, paths }, repoPath] as const,
  commitFiles: (sha: string, repoPath: string | null) =>
    ['commitFiles', sha, repoPath] as const,
  diff: (path: string, ref: string | undefined, base: string | undefined, repoPath: string | null) =>
    ['diff', { path, ref, base }, repoPath] as const,
  fileContent: (path: string, ref: string | undefined, repoPath: string | null) =>
    ['fileContent', { path, ref }, repoPath] as const,
  blame: (path: string, ref: string | undefined, repoPath: string | null) =>
    ['blame', { path, ref }, repoPath] as const,
  branchCompare: (branchA: string | null, branchB: string | null, repoPath: string | null) =>
    ['branchCompare', branchA, branchB, repoPath] as const,
};

import type { Commit, RefLabel } from '@shared/git';

export type GraphNodeKind = 'normal' | 'merge' | 'root' | 'head' | 'detached-head';
export type GraphEdgeKind = 'vertical' | 'branch-out' | 'merge-in';

export interface GraphEdgeSegment {
  kind: GraphEdgeKind;
  fromLane: number;
  toLane: number;
  colorKey: string;
  parentIndex: number;
}

export interface GraphNode {
  lane: number;
  kind: GraphNodeKind;
  colorKey: string;
}

export interface GraphRowRefs {
  head: RefLabel | null;
  branches: RefLabel[];
  tags: RefLabel[];
}

export interface GraphRow {
  sha: string;
  commit: Commit;
  row: number;
  node: GraphNode;
  activeLanes: number[];
  edges: GraphEdgeSegment[];
  refs: GraphRowRefs;
}

export interface GraphLayoutResult {
  rows: GraphRow[];
  maxLane: number;
}

export function compileGraphLayout(commits: Commit[]): GraphLayoutResult {
  if (commits.length === 0) {
    return { rows: [], maxLane: -1 };
  }

  const rows: GraphRow[] = [];
  const active: Array<string | null> = [];
  const reservedByBranch = new Map<string, number>();
  const branchBySha = new Map<string, string>();
  let maxLane = -1;

  for (const commit of commits) {
    const localBranch = firstLocalBranch(commit.refs);
    if (localBranch) branchBySha.set(commit.sha, localBranch.shortName);
  }

  // Propagate branch name backwards along the first-parent line to keep branch lines in uniform colors
  for (const commit of commits) {
    const currentBranchName = branchBySha.get(commit.sha);
    if (currentBranchName && commit.parents.length > 0) {
      const firstParentSha = commit.parents[0]!;
      if (!branchBySha.has(firstParentSha)) {
        branchBySha.set(firstParentSha, currentBranchName);
      }
    }
  }

  for (let rowIndex = 0; rowIndex < commits.length; rowIndex++) {
    const commit = commits[rowIndex]!;
    const localBranch = branchBySha.get(commit.sha);
    const lane = resolveCommitLane(commit.sha, localBranch, active, reservedByBranch);
    const colorKey = localBranch ? `branch:${localBranch}` : `sha:${commit.sha}`;

    active[lane] = null;

    const edges: GraphEdgeSegment[] = [];
    for (let parentIndex = 0; parentIndex < commit.parents.length; parentIndex++) {
      const parentSha = commit.parents[parentIndex]!;
      const parentBranch = branchBySha.get(parentSha);
      const targetLane = resolveParentLane(parentSha, parentIndex, lane, parentBranch, active, reservedByBranch);

      active[targetLane] = parentSha;
      edges.push({
        kind: targetLane === lane ? 'vertical' : parentIndex === 0 ? 'merge-in' : 'branch-out',
        fromLane: lane,
        toLane: targetLane,
        colorKey: parentBranch ? `branch:${parentBranch}` : `sha:${parentSha}`,
        parentIndex,
      });
      if (targetLane > maxLane) maxLane = targetLane;
    }

    if (lane > maxLane) maxLane = lane;

    rows.push({
      sha: commit.sha,
      commit,
      row: rowIndex,
      node: {
        lane,
        kind: nodeKind(commit),
        colorKey,
      },
      activeLanes: active
        .map((value, index) => (value !== null ? index : -1))
        .filter((index) => index !== -1),
      edges,
      refs: groupRefs(commit.refs),
    });
  }

  return { rows, maxLane };
}

function resolveCommitLane(
  sha: string,
  localBranch: string | undefined,
  active: Array<string | null>,
  reservedByBranch: Map<string, number>,
): number {
  const activeLane = active.indexOf(sha);
  if (activeLane !== -1) return activeLane;

  if (localBranch) {
    const reserved = reservedByBranch.get(localBranch);
    if (reserved !== undefined) return reserved;
  }

  const lane = firstFreeLane(active, reservedByBranch);
  if (localBranch && !reservedByBranch.has(localBranch)) {
    reservedByBranch.set(localBranch, lane);
  }
  return lane;
}

function resolveParentLane(
  parentSha: string,
  parentIndex: number,
  commitLane: number,
  parentBranch: string | undefined,
  active: Array<string | null>,
  reservedByBranch: Map<string, number>,
): number {
  const existing = active.indexOf(parentSha);
  if (existing !== -1) return existing;

  if (parentIndex === 0) return commitLane;

  if (parentBranch) {
    const reserved = reservedByBranch.get(parentBranch);
    if (reserved !== undefined) return reserved;
  }

  const lane = firstFreeLane(active, reservedByBranch);
  if (parentBranch && !reservedByBranch.has(parentBranch)) {
    reservedByBranch.set(parentBranch, lane);
  }
  return lane;
}

function firstFreeLane(active: Array<string | null>, reservedByBranch: Map<string, number>): number {
  const reserved = new Set(reservedByBranch.values());
  for (let lane = 0; ; lane++) {
    if (lane >= active.length) active.push(null);
    if (active[lane] === null && !reserved.has(lane)) {
      return lane;
    }
  }
}

function firstLocalBranch(refs: readonly RefLabel[]): RefLabel | undefined {
  return refs.find((ref) => ref.kind === 'local' && !ref.isHead);
}

function nodeKind(commit: Commit): GraphNodeKind {
  const headRef = commit.refs.find((ref) => ref.isHead);
  if (headRef?.kind === 'HEAD') return 'detached-head';
  if (headRef) return 'head';
  if (commit.parents.length === 0) return 'root';
  if (commit.parents.length > 1) return 'merge';
  return 'normal';
}

function groupRefs(refs: readonly RefLabel[]): GraphRowRefs {
  return {
    head: refs.find((ref) => ref.isHead) ?? null,
    branches: refs.filter((ref) => !ref.isHead && (ref.kind === 'local' || ref.kind === 'remote')),
    tags: refs.filter((ref) => ref.kind === 'tag'),
  };
}

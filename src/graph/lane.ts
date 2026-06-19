// src/graph/lane.ts — stable branch-anchored lane assignment.
// See docs/architecture/lane-algorithm.md.

import type { Commit } from '@shared/git';

export interface LaneAssignment {
  maxLaneUsed: number;
  commits: Commit[];

  // Updated branch→lane reservations (caller persists in GraphCache).
  branchLanes: Record<string, number>;
  reservedLanes: Set<number>;
  assignedShas: Set<string>;

  // Lane index → owner branch name (for branch-name-based coloring).
  laneOwners: Map<number, string>;
}

/**
 * Assign lanes to commits (newest→oldest order).
 *
 * Stability guarantee: a branch keeps the same lane for its lifetime. When
 * a merge parent (i > 0) belongs to a known branch, it is threaded through
 * that branch's reserved lane rather than opening a new unnamed lane. This
 * prevents lane collapse/jumping on scroll and incremental loads.
 *
 * @param commits  reverse-chronological commit list
 * @param cache    persisted branch→lane reservations from the GraphCache store
 */
export function assignLanes(
  commits: Commit[],
  cache?: {
    branchLanes: Record<string, number>;
    reservedLanes: Set<number>;
  },
): LaneAssignment {
  const branchLanes: Record<string, number> = { ...cache?.branchLanes };
  const reserved = new Set(cache?.reservedLanes ?? []);

  // Pre-pass: map sha → primary branch name (first local ref).
  const shaToBranch = new Map<string, string>();
  for (const c of commits) {
    const local = c.refs.find((r) => r.kind === 'local' && !r.isHead);
    if (local) shaToBranch.set(c.sha, local.shortName);
  }

  const lanes: (string | null)[] = [];
  let maxLaneUsed = cache?.branchLanes
    ? Math.max(-1, ...Object.values(cache.branchLanes))
    : -1;
  const assignedShas = new Set<string>();
  const laneOwners = new Map<number, string>();

  for (const c of commits) {
    const branchName = shaToBranch.get(c.sha) ?? null;

    // 1. Find this commit's lane.
    let lane = lanes.indexOf(c.sha);
    if (lane === -1) {
      if (branchName && branchLanes[branchName] !== undefined) {
        lane = branchLanes[branchName];
      } else {
        lane = firstFreeLane(lanes, reserved);
        if (branchName && branchLanes[branchName] === undefined) {
          branchLanes[branchName] = lane;
          reserved.add(lane);
          laneOwners.set(lane, branchName);
        }
      }
    }
    c.lane = lane;
    assignedShas.add(c.sha);

    // 2. Clear the lane — parent thread replaces the commit dot.
    lanes[lane] = null;

    // 3. Place parents.
    c.parentLanes = [];
    for (let i = 0; i < c.parents.length; i++) {
      const parent = c.parents[i]!;
      const existing = lanes.indexOf(parent);
      if (existing !== -1) {
        c.parentLanes.push(existing);
      } else if (i === 0) {
        // First parent continues on this commit's lane (trunk).
        lanes[lane] = parent;
        c.parentLanes.push(lane);
      } else {
        // Merge parent (i > 0). Route to its branch's reserved lane if known.
        const parentName = shaToBranch.get(parent) ?? null;
        let parentLane: number;
        if (parentName && branchLanes[parentName] !== undefined) {
          parentLane = branchLanes[parentName];
        } else {
          parentLane = firstFreeLane(lanes, reserved);
          if (parentName && branchLanes[parentName] === undefined) {
            branchLanes[parentName] = parentLane;
            reserved.add(parentLane);
            laneOwners.set(parentLane, parentName);
          }
        }
        lanes[parentLane] = parent;
        c.parentLanes.push(parentLane);
      }
    }

    // 4. Track max width.
    for (let i = lanes.length - 1; i >= 0; i--) {
      if (lanes[i] !== null) {
        if (i > maxLaneUsed) maxLaneUsed = i;
        break;
      }
    }
  }

  return { maxLaneUsed, commits, branchLanes, reservedLanes: reserved, assignedShas, laneOwners };
}

/**
 * Return the lowest null lane NOT reserved for a different branch.
 * Reserved lanes may be null (freed) but still belong to their branch
 * and must not be reused by unrelated branches.
 */
function firstFreeLane(lanes: (string | null)[], reserved: Set<number>): number {
  let i = 0;
  while (true) {
    if (i >= lanes.length) {
      lanes.push(null);
    }
    if (lanes[i] === null && !reserved.has(i)) {
      return i;
    }
    i++;
  }
}

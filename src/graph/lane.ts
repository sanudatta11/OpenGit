// src/graph/lane.ts — lane assignment algorithm.
// See docs/architecture/lane-algorithm.md.

import type { Commit } from '@shared/git';

export interface LaneAssignment {
  maxLaneUsed: number;
  commits: Commit[]; // same array, with lane/parentLanes filled
}

/**
 * Assign lanes to commits. Commits must be in newest→oldest order.
 * Mutates the input commits' `lane` and `parentLanes` fields.
 */
export function assignLanes(commits: Commit[]): LaneAssignment {
  const lanes: (string | null)[] = [];
  let maxLaneUsed = -1;

  for (const c of commits) {
    // 1. Find this commit's lane.
    let lane = lanes.indexOf(c.sha);
    if (lane === -1) {
      lane = firstFreeLane(lanes);
    }
    c.lane = lane;

    // 2. Clear the lane — the commit's dot occupies this row; parent thread replaces it.
    lanes[lane] = null;

    // 3. Place parents.
    c.parentLanes = [];
    for (let i = 0; i < c.parents.length; i++) {
      const parent = c.parents[i]!;
      const existing = lanes.indexOf(parent);
      if (existing !== -1) {
        // Parent already on a lane (a previous child placed it). Reuse.
        c.parentLanes.push(existing);
      } else if (i === 0) {
        // First parent continues on this commit's lane (the trunk).
        lanes[lane] = parent;
        c.parentLanes.push(lane);
      } else {
        // Second+ parent (merge branch coming in). Open a new lane.
        const newLane = firstFreeLane(lanes);
        lanes[newLane] = parent;
        c.parentLanes.push(newLane);
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

  return { maxLaneUsed, commits };
}

function firstFreeLane(lanes: (string | null)[]): number {
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] === null) return i;
  }
  lanes.push(null);
  return lanes.length - 1;
}

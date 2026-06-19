// src/stores/graphCache.ts — persistent lane-to-branch cache.
// Survives across scroll/fetch; invalidated on repo switch / new commits.

import { create } from 'zustand';

export interface GraphCacheState {
  // Branch name -> reserved lane number. A branch keeps its lane for its
  // entire lifetime — lane numbers are never reassigned to other branches.
  branchLanes: Record<string, number>;

  // All lane indices currently reserved (union of branchLanes values).
  // Used by firstFreeLane to skip lanes belonging to other branches.
  reservedLanes: Set<number>;

  // Highest lane index ever allocated. Grows monotonically; never shrinks.
  maxLaneUsed: number;

  // Commit SHAs that have been assigned lanes. When new data arrives from
  // the backend, only SHAs not in this set are reassigned.
  assignedShas: Set<string>;

  // Update after each assignLanes pass.
  update: (patch: {
    branchLanes: Record<string, number>;
    reservedLanes: Set<number>;
    maxLaneUsed: number;
    assignedShas: Set<string>;
  }) => void;

  // Reset on repo close.
  reset: () => void;
}

export const useGraphCacheStore = create<GraphCacheState>((set) => ({
  branchLanes: {},
  reservedLanes: new Set<number>(),
  maxLaneUsed: -1,
  assignedShas: new Set<string>(),

  update: (patch) =>
    set({
      branchLanes: patch.branchLanes,
      reservedLanes: patch.reservedLanes,
      maxLaneUsed: patch.maxLaneUsed,
      assignedShas: patch.assignedShas,
    }),

  reset: () =>
    set({
      branchLanes: {},
      reservedLanes: new Set<number>(),
      maxLaneUsed: -1,
      assignedShas: new Set<string>(),
    }),
}));

// Reset on repo close.
import { useRepoStore } from './repo';
useRepoStore.subscribe((state) => {
  if (!state.activeRepo) {
    useGraphCacheStore.getState().reset();
  }
});

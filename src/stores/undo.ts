import { create } from 'zustand';

export type UndoableAction = {
  kind: 'commit' | 'merge' | 'rebase' | 'cherry-pick' | 'revert' | 'branch-create' | 'branch-delete' | 'stash-apply' | 'stash-pop';
  label: string;
  branch?: string;
  sha?: string;
  ts: number;
};

interface UndoStore {
  lastAction: UndoableAction | null;
  setLastAction: (action: UndoableAction | null) => void;
  isPending: boolean;
  setIsPending: (v: boolean) => void;
}

export const useUndoStore = create<UndoStore>((set) => ({
  lastAction: null,
  setLastAction: (action) => set({ lastAction: action }),
  isPending: false,
  setIsPending: (v) => set({ isPending: v }),
}));

import { useRepoStore } from './repo';
useRepoStore.subscribe((state) => { if (!state.activeRepo) useUndoStore.getState().setLastAction(null); });

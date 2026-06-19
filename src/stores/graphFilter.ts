// src/stores/graphFilter.ts — solo/mute refs for the commit graph.

import { create } from 'zustand';

interface GraphFilterStore {
  soloedRefs: string[];
  mutedRefs: string[];

  solo: (ref: string) => void;
  unsolo: (ref: string) => void;
  clearSolo: () => void;
  mute: (ref: string) => void;
  unmute: (ref: string) => void;
  clearAll: () => void;
  isSoloed: (ref: string) => boolean;
  isMuted: (ref: string) => boolean;
  isActive: () => boolean;
}

export const useGraphFilterStore = create<GraphFilterStore>((set, get) => ({
  soloedRefs: [],
  mutedRefs: [],

  solo: (ref) => set((s) => ({ soloedRefs: [...s.soloedRefs.filter((r) => r !== ref), ref] })),
  unsolo: (ref) => set((s) => ({ soloedRefs: s.soloedRefs.filter((r) => r !== ref) })),
  clearSolo: () => set({ soloedRefs: [] }),
  mute: (ref) => set((s) => ({ mutedRefs: [...s.mutedRefs, ref] })),
  unmute: (ref) => set((s) => ({ mutedRefs: s.mutedRefs.filter((r) => r !== ref) })),
  clearAll: () => set({ soloedRefs: [], mutedRefs: [] }),
  isSoloed: (ref) => get().soloedRefs.includes(ref),
  isMuted: (ref) => get().mutedRefs.includes(ref),
  isActive: () => get().soloedRefs.length > 0 || get().mutedRefs.length > 0,
}));

// Reset on repo close.
import { useRepoStore } from './repo';
useRepoStore.subscribe((state) => {
  if (!state.repo) {
    useGraphFilterStore.getState().clearAll();
  }
});

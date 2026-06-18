// src/stores/rebase.ts — interactive rebase editor state.

import { create } from 'zustand';
import type { RebaseInteractivePlanItem, RebaseInteractiveAction } from '@shared/ipc';

export type { RebaseInteractiveAction };

interface RebaseStore {
  isActive: boolean;
  onto: string;
  currentBranch: string | null;
  items: RebaseInteractivePlanItem[];
  setActive: (onto: string, currentBranch: string | null, items: RebaseInteractivePlanItem[]) => void;
  setInactive: () => void;
  updateAction: (id: string, action: RebaseInteractiveAction) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  updateMessage: (id: string, message: string) => void;
}

export const useRebaseStore = create<RebaseStore>((set) => ({
  isActive: false,
  onto: '',
  currentBranch: null,
  items: [],
  setActive: (onto, currentBranch, items) => set({ isActive: true, onto, currentBranch, items }),
  setInactive: () => set({ isActive: false, onto: '', currentBranch: null, items: [] }),
  updateAction: (id, action) =>
    set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, action } : i)) })),
  reorder: (fromIndex, toIndex) =>
    set((s) => {
      const items = [...s.items];
      const [moved] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, moved!);
      return { items };
    }),
  updateMessage: (id, message) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, subject: message } : i)) })),
}));

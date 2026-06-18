// src/stores/log.ts — operation log ring buffer (last 200).

import { create } from 'zustand';
import type { LogEntry } from '@shared/git';

const MAX = 200;

interface LogStore {
  entries: LogEntry[];
  push: (e: LogEntry) => void;
  clear: () => void;
}

export const useLogStore = create<LogStore>((set) => ({
  entries: [],
  push: (e) =>
    set((s) => {
      const next = [...s.entries, e];
      if (next.length > MAX) next.splice(0, next.length - MAX);
      return { entries: next };
    }),
  clear: () => set({ entries: [] }),
}));

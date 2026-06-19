import { create } from 'zustand';
import type { PushResultData } from '@shared/ipc';

export interface PushBannerRejection extends PushResultData {
  message?: string;
  remote?: string;
  branch?: string;
}

interface PushBannerStore {
  rejection: PushBannerRejection | null;
  setRejection: (r: PushBannerRejection | null) => void;
}

export const usePushBannerStore = create<PushBannerStore>((set) => ({
  rejection: null,
  setRejection: (r) => set({ rejection: r }),
}));

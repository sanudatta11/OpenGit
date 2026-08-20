// Shared settings query/mutation helpers used by SettingsPanel, GraphPane, etc.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SettingsData } from '@shared/ipc';
import { api } from '../ipc/api';

export function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.settings.get(),
  });
}

export function useSetSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<SettingsData>) => api.settings.set(patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}

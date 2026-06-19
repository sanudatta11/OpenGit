// src/queries/useUpdater.ts — subscribes to updater events and surfaces them
// as toasts. Dedupes by version so the launch check + any manual re-check
// don't double-toast the same release.

import { useEffect, useRef } from 'react';
import { api } from '../ipc/api';
import { useToastStore } from '../stores/toast';
import type { UpdaterEvent } from '@shared/ipc';

export function useUpdaterEvents(): void {
  const addToast = useToastStore((s) => s.addToast);
  const seen = useRef<Set<string>>(new Set());

  useEffect(() => {
    const off = api.updater.onEvent((event: UpdaterEvent) => {
      switch (event.type) {
        case 'available': {
          if (seen.current.has(event.info.version)) return;
          seen.current.add(event.info.version);
          addToast(`Update ${event.info.version} available — downloading…`, 'info', 6000);
          break;
        }
        case 'downloaded': {
          if (seen.current.has(`installed:${event.version}`)) return;
          seen.current.add(`installed:${event.version}`);
          addToast(`Update ${event.version} downloaded — will install on restart`, 'success', 8000);
          break;
        }
        case 'error': {
          addToast(`Update check failed: ${event.message}`, 'error', 6000);
          break;
        }
        case 'not-available':
          // Silent on launch; the manual button surfaces "up to date".
          break;
      }
    });
    return off;
  }, [addToast]);
}

export function useCheckForUpdates() {
  const addToast = useToastStore((s) => s.addToast);
  return async () => {
    const result = await api.updater.check();
    if (result.status === 'up-to-date') {
      addToast(result.version ? `OpenGit is up to date (${result.version})` : 'OpenGit is up to date', 'success', 4000);
    } else if (result.status === 'available') {
      addToast(`Update ${result.version} available — downloading…`, 'info', 6000);
    } else {
      addToast(`Update check failed: ${result.message ?? 'unknown error'}`, 'error', 6000);
    }
    return result;
  };
}

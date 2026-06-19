// src/stores/theme.ts — theme state. Reads settings, applies class to <html>.

import { create } from 'zustand';
import { api } from '../ipc/api';

export type AppTheme = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

interface ThemeStore {
  theme: AppTheme;
  resolved: ResolvedTheme;
  setTheme: (t: AppTheme) => void;
}

function resolveTheme(t: AppTheme): ResolvedTheme {
  if (t === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t;
}

function applyTheme(resolved: ResolvedTheme) {
  if (resolved === 'light') {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
}

export const useThemeStore = create<ThemeStore>((set) => ({
  theme: 'system',
  resolved: 'dark',
  setTheme: (t) => {
    const resolved = resolveTheme(t);
    applyTheme(resolved);
    set({ theme: t, resolved });
  },
}));

// Initialize on load: read settings, set theme, listen to system changes.
export async function initTheme(): Promise<void> {
  try {
    const settings = await api.settings.get();
    const mode = settings.theme ?? 'system';
    const store = useThemeStore.getState();
    store.setTheme(mode);
  } catch {
    useThemeStore.getState().setTheme('system');
  }

  // Listen for system preference changes when in 'system' mode.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    const store = useThemeStore.getState();
    if (store.theme === 'system') {
      const resolved = e.matches ? 'dark' : 'light';
      applyTheme(resolved);
      useThemeStore.setState({ resolved });
    }
  });
}

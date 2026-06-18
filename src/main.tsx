// src/main.tsx — React entry.

import './monaco/setup';

import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';
import { useLogStore } from './stores/log';
import { api } from './ipc/api';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
    mutations: { retry: false },
  },
});

// Subscribe to operation log.
void api.log.subscribe((entry) => {
  useLogStore.getState().push(entry);
});

// Invalidate queries on .git watch events.
api.watch.onEvent((evt) => {
  // Coalesce: any .git change refreshes status, branches, state.
  if (evt.kind === 'head' || evt.kind === 'refs') {
    void queryClient.invalidateQueries({ queryKey: ['branches'] });
    void queryClient.invalidateQueries({ queryKey: ['log'] });
  }
  if (evt.kind === 'index') {
    void queryClient.invalidateQueries({ queryKey: ['status'] });
  }
  if (['merge', 'rebase', 'cherry-pick', 'revert', 'bisect'].includes(evt.kind)) {
    void queryClient.invalidateQueries({ queryKey: ['state'] });
    void queryClient.invalidateQueries({ queryKey: ['status'] });
  }
});

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);

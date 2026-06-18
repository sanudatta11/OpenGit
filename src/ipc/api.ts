// src/ipc/api.ts — typed wrapper around window.api. Single point of contact in renderer.

import type { Api } from '../../electron/preload';

declare global {
  interface Window {
    api: Api;
  }
}

export const api: Api = window.api;

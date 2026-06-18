// electron/main/git/session.ts — tracks the currently-open repo. Single repo at a time (MVP).

import type { OpenedRepo } from './repo';
import { cancelAll } from './client';

let current: OpenedRepo | null = null;

export function setCurrentRepo(repo: OpenedRepo | null): void {
  if (repo === null && current) {
    cancelAll();
  }
  current = repo;
}

export function getCurrentRepo(): OpenedRepo | null {
  return current;
}

export function requireCurrentRepo(): OpenedRepo {
  if (!current) {
    throw new Error('No repository is open. Call repo:open first.');
  }
  return current;
}

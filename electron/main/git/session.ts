// electron/main/git/session.ts — tracks open repos. Multi-repo with tab switching.

import type { OpenedRepo } from './repo';
import { cancelAll } from './client';
import type { RepoInfo } from '@shared/git';

const repos = new Map<string, OpenedRepo>();
let activePath: string | null = null;

// ── New multi-repo API ──────────────────────────────────────────────────────

export function addRepo(opened: OpenedRepo): void {
  repos.set(opened.info.path, opened);
  activePath = opened.info.path;
}

export function switchActiveRepo(path: string): void {
  if (!repos.has(path)) throw new Error(`Repository not open: ${path}`);
  cancelAll();
  activePath = path;
}

export function removeRepo(path: string): OpenedRepo | undefined {
  const removed = repos.get(path);
  repos.delete(path);
  if (activePath === path) {
    activePath = repos.keys().next().value ?? null;
    if (activePath) cancelAll();
  }
  return removed;
}

export function getOpenRepoInfos(): RepoInfo[] {
  return [...repos.values()].map((r) => r.info);
}

export function getRepo(path: string): OpenedRepo | undefined {
  return repos.get(path);
}

// ── Backward-compatible single-repo API ─────────────────────────────────────

export function setCurrentRepo(repo: OpenedRepo | null): void {
  if (repo) {
    addRepo(repo);
  } else if (activePath) {
    removeRepo(activePath);
  }
}

export function getCurrentRepo(): OpenedRepo | null {
  if (!activePath) return null;
  return repos.get(activePath) ?? null;
}

export function requireCurrentRepo(): OpenedRepo {
  const repo = getCurrentRepo();
  if (!repo) throw new Error('No repository is open. Call repo:open first.');
  return repo;
}

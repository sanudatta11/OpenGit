// electron/main/git/session.ts — tracks open repos. Multi-repo with tab switching.

import type { OpenedRepo } from './repo';
import { cancelAll } from './client';
import type { RepoInfo } from '@shared/git';

const repos = new Map<string, OpenedRepo>();
let activePath: string | null = null;

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

// ── New multi-repo API ──────────────────────────────────────────────────────

export function addRepo(opened: OpenedRepo): void {
  const normPath = normalizePath(opened.info.path);
  repos.set(normPath, opened);
  activePath = normPath;
}

export function switchActiveRepo(path: string): void {
  const normPath = normalizePath(path);
  if (!repos.has(normPath)) throw new Error(`Repository not open: ${path}`);
  cancelAll();
  activePath = normPath;
}

export function removeRepo(path: string): OpenedRepo | undefined {
  const normPath = normalizePath(path);
  const removed = repos.get(normPath);
  repos.delete(normPath);
  if (activePath === normPath) {
    activePath = repos.keys().next().value ?? null;
    if (activePath) cancelAll();
  }
  return removed;
}

export function getOpenRepoInfos(): RepoInfo[] {
  return [...repos.values()].map((r) => r.info);
}

export function getRepo(path: string): OpenedRepo | undefined {
  return repos.get(normalizePath(path));
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

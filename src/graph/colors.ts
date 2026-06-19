// src/graph/colors.ts — stable lane colors via CSS variables + branch-name patterns.

const PALETTE_SIZE = 12;

let cachedEl: HTMLElement | null = null;

function resolveVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  if (!cachedEl || !cachedEl.isConnected) cachedEl = document.documentElement;
  const val = getComputedStyle(cachedEl).getPropertyValue(name).trim();
  return val || fallback;
}

/**
 * Resolved CSS variable color for a lane index. Reads --color-lane-N from
 * the current theme (dark/light), with a hardcoded fallback.
 */
export function laneColorByIndex(lane: number): string {
  if (lane < 0) return '#6e7681';
  return resolveVar(`--color-lane-${lane % PALETTE_SIZE}`, FALLBACK_PALETTE[lane % PALETTE_SIZE]!);
}

/**
 * Stable color for a branch name, using pattern matching then FNV-1a hash.
 * Same branch name → same color across sessions/themes.
 */
export function branchColorByName(name: string): string {
  const lowered = name.toLowerCase();
  let idx: number;
  if (lowered === 'main' || lowered === 'master') idx = 0;
  else if (lowered === 'develop' || lowered === 'dev') idx = 4;
  else if (lowered.startsWith('feature/') || lowered.startsWith('feat/')) idx = 5;
  else if (lowered.startsWith('release/')) idx = 2;
  else if (lowered.startsWith('hotfix/')) idx = 1;
  else if (lowered.startsWith('bugfix/') || lowered.startsWith('fix/')) idx = 7;
  else idx = fnv1a(name) % PALETTE_SIZE;
  return resolveVar(`--color-lane-${idx}`, FALLBACK_PALETTE[idx]!);
}

/**
 * SHA-based stable color (for lanes with no known branch name).
 */
export function laneColorBySha(sha: string | null): string {
  if (!sha) return '#6e7681';
  const idx = fnv1a(sha) % PALETTE_SIZE;
  return resolveVar(`--color-lane-${idx}`, FALLBACK_PALETTE[idx]!);
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const FALLBACK_PALETTE = [
  '#3b82f6', '#f85149', '#3fb950', '#d29922', '#a371f7',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#10b981',
  '#eab308', '#06b6d4',
];

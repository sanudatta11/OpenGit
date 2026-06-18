// src/graph/colors.ts — stable lane colors via FNV-1a hash of the lane owner SHA.

const PALETTE = [
  '#3b82f6', '#f85149', '#3fb950', '#d29922', '#a371f7',
  '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#10b981',
  '#eab308', '#06b6d4',
];

export function laneColorBySha(sha: string | null): string {
  if (!sha) return '#6e7681';
  return PALETTE[fnv1a(sha) % PALETTE.length]!;
}

export function laneColorByIndex(lane: number): string {
  if (lane < 0) return '#6e7681';
  return PALETTE[lane % PALETTE.length]!;
}

function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

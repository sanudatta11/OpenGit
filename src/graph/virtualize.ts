// src/graph/virtualize.ts — virtualization math for the commit graph.
// Extracted for testability.

export interface VirtualizationParams {
  scrollTop: number;
  viewportHeight: number;
  rowHeight: number;
  totalCommits: number;
  bufferRows: number;
}

export interface VirtualizationResult {
  firstRow: number;
  visibleCount: number;
  lastRow: number;
  offsetY: number;
  canvasHeight: number;
}

/**
 * Compute the virtualization window for the commit graph.
 *
 * The canvas must:
 * 1. Be translated by offsetY (= firstRow * rowHeight) so it aligns with the
 *    visible HTML rows as the user scrolls.
 * 2. Have height = visible.length * rowHeight + rowHeight so all visible rows
 *    (plus one extra for partial lines at the bottom edge) are drawn.
 */
export function computeVirtualization(p: VirtualizationParams): VirtualizationResult {
  const firstRow = Math.max(0, Math.floor(p.scrollTop / p.rowHeight) - p.bufferRows);
  const visibleCount = Math.ceil(p.viewportHeight / p.rowHeight) + p.bufferRows * 2;
  const lastRow = Math.min(p.totalCommits, firstRow + visibleCount);
  const offsetY = firstRow * p.rowHeight;
  const visibleLength = lastRow - firstRow;
  const canvasHeight = visibleLength * p.rowHeight + p.rowHeight;

  return { firstRow, visibleCount, lastRow, offsetY, canvasHeight };
}

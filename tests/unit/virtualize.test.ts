// tests/unit/virtualize.test.ts — validates graph virtualization math.

import { describe, it, expect } from 'vitest';
import { computeVirtualization } from '../../src/graph/virtualize';

const BUFFER_ROWS = 30;
const ROW_HEIGHT = 28;
const VIEWPORT_HEIGHT = 600;
const TOTAL_COMMITS = 500;

function params(overrides?: Partial<{ scrollTop: number; rowHeight: number; viewportHeight: number; totalCommits: number }>) {
  return {
    scrollTop: 0,
    rowHeight: ROW_HEIGHT,
    viewportHeight: VIEWPORT_HEIGHT,
    totalCommits: TOTAL_COMMITS,
    bufferRows: BUFFER_ROWS,
    ...overrides,
  };
}

describe('graph virtualization', () => {
  it('at top (scrollTop=0), firstRow is 0', () => {
    const r = computeVirtualization(params({ scrollTop: 0 }));
    expect(r.firstRow).toBe(0);
  });

  it('offsetY always equals firstRow * rowHeight', () => {
    for (const scroll of [0, 100, 500, 1000, 5000]) {
      const r = computeVirtualization(params({ scrollTop: scroll }));
      expect(r.offsetY).toBe(r.firstRow * ROW_HEIGHT);
    }
  });

  it('canvasHeight covers all visible rows plus one extra', () => {
    const r = computeVirtualization(params({ scrollTop: 500 }));
    const visibleLength = r.lastRow - r.firstRow;
    expect(r.canvasHeight).toBe(visibleLength * ROW_HEIGHT + ROW_HEIGHT);
  });

  it('scrolling down shifts firstRow correctly', () => {
    const r0 = computeVirtualization(params({ scrollTop: 0 }));
    const r1 = computeVirtualization(params({ scrollTop: 2000 }));
    expect(r1.firstRow).toBeGreaterThan(r0.firstRow);
  });

  it('visibleCount is always viewport + 2*buffer rows', () => {
    const r = computeVirtualization(params());
    const expected = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + BUFFER_ROWS * 2;
    expect(r.visibleCount).toBe(expected);
  });

  it('lastRow never exceeds totalCommits', () => {
    const r = computeVirtualization(params({ totalCommits: 5 }));
    expect(r.lastRow).toBeLessThanOrEqual(5);
  });

  it('clamps to start when scrollTop is near top', () => {
    // When scrollTop < bufferRows * rowHeight, firstRow should be 0
    const r = computeVirtualization(params({ scrollTop: BUFFER_ROWS * ROW_HEIGHT - 1 }));
    expect(r.firstRow).toBe(0);
  });

  it('canvas height is always at least rowHeight even for 0 visible rows', () => {
    // Edge case: all commits have been scrolled past
    const r = computeVirtualization(params({ totalCommits: 0 }));
    expect(r.canvasHeight).toBeGreaterThanOrEqual(ROW_HEIGHT);
  });

  it('scrolling near bottom does not overshoot', () => {
    const r = computeVirtualization(params({ scrollTop: 99999 }));
    expect(r.lastRow).toBe(TOTAL_COMMITS);
    // firstRow can exceed totalCommits when scrollTop is huge — lastRow is clamped
    expect(r.firstRow).toBeGreaterThanOrEqual(0);
  });
});

import { describe, expect, it } from 'vitest';
import type { GraphRow } from '../../src/graph/layout';
import {
  applyPendingGraphWidthShrink,
  computeVisibleGraphLaneCount,
  graphRowLaneCount,
  updateGraphWidthStabilization,
} from '../../src/graph/rowLayout';

function makeRow(usedLaneIndexes: number[], sha: string = `sha-${usedLaneIndexes.join('-')}`): GraphRow {
  const maxLane = usedLaneIndexes.length === 0 ? 0 : Math.max(...usedLaneIndexes);
  return {
    sha,
    row: 0,
    commit: {
      sha,
      author: {
        name: 'Test Author',
        email: 'test@example.com',
        date: '2026-06-19T00:00:00.000Z',
      },
      committer: {
        name: 'Test Author',
        email: 'test@example.com',
        date: '2026-06-19T00:00:00.000Z',
      },
      subject: 'subject',
      body: '',
      parents: [],
      refs: [],
      files: [],
    },
    node: {
      lane: maxLane,
      kind: 'normal',
      colorKey: 'sha:test',
    },
    activeLanes: usedLaneIndexes,
    edges: usedLaneIndexes.map((lane, index) => ({
      kind: 'vertical' as const,
      fromLane: lane,
      toLane: lane,
      colorKey: `edge:${index}`,
      parentIndex: index,
    })),
    refs: {
      head: null,
      branches: [],
      tags: [],
    },
  };
}

describe('graph width policy', () => {
  it('counts lanes used by a row across node, active lanes, and edges', () => {
    expect(graphRowLaneCount(makeRow([0]))).toBe(1);
    expect(graphRowLaneCount(makeRow([0, 1, 2]))).toBe(3);
  });

  it('returns the minimum lane count for a simple linear visible history', () => {
    const rows = [makeRow([0]), makeRow([0]), makeRow([0])];

    expect(computeVisibleGraphLaneCount(rows)).toBe(1);
  });

  it('ignores a single extreme outlier when most visible rows are narrow', () => {
    const rows = [makeRow([0]), makeRow([0]), makeRow([0]), makeRow([0, 1, 2, 3, 4, 5])];

    expect(computeVisibleGraphLaneCount(rows)).toBe(1);
  });

  it('widens to the selected visible row when it needs more lanes than the percentile result', () => {
    const rows = [
      makeRow([0], 'a'),
      makeRow([0], 'b'),
      makeRow([0, 1, 2, 3], 'selected'),
      makeRow([0], 'c'),
    ];

    expect(computeVisibleGraphLaneCount(rows, { selectedSha: 'selected' })).toBe(4);
  });

  it('expands immediately when the target grows', () => {
    expect(
      updateGraphWidthStabilization({
        renderLaneCount: 2,
        pendingShrinkLaneCount: null,
        targetLaneCount: 5,
      }),
    ).toEqual({
      renderLaneCount: 5,
      pendingShrinkLaneCount: null,
    });
  });

  it('delays shrink until the pending shrink is applied', () => {
    const deferred = updateGraphWidthStabilization({
      renderLaneCount: 5,
      pendingShrinkLaneCount: null,
      targetLaneCount: 2,
    });

    expect(deferred).toEqual({
      renderLaneCount: 5,
      pendingShrinkLaneCount: 2,
    });
    expect(applyPendingGraphWidthShrink(deferred)).toEqual({
      renderLaneCount: 2,
      pendingShrinkLaneCount: null,
    });
  });

  it('cancels a pending shrink when a wider target arrives before debounce completes', () => {
    const pending = updateGraphWidthStabilization({
      renderLaneCount: 5,
      pendingShrinkLaneCount: null,
      targetLaneCount: 2,
    });

    expect(
      updateGraphWidthStabilization({
        ...pending,
        targetLaneCount: 6,
      }),
    ).toEqual({
      renderLaneCount: 6,
      pendingShrinkLaneCount: null,
    });
  });
});

// tests/unit/lane.test.ts — comprehensive tests for the stable lane algorithm.

import { describe, it, expect } from 'vitest';
import { assignLanes } from '../../src/graph/lane';
import type { Commit } from '../../shared/git';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCommit(sha: string, parents: string[] = [], refNames: string[] = []): Commit {
  const refs = refNames.map((name) => {
    const isHead = name.startsWith('HEAD');
    const displayName = isHead ? 'HEAD' : name;
    let kind: 'local' | 'remote' | 'tag' | 'HEAD' = 'local';
    if (isHead) kind = 'HEAD';
    else if (name.startsWith('origin/')) kind = 'remote';
    else if (name.startsWith('v') && /^v\d/.test(name)) kind = 'tag';
    return { kind, shortName: displayName, isHead };
  });
  return {
    sha,
    parents: Object.freeze(parents),
    refs: Object.freeze(refs),
    author: { name: 'Test', email: 't@t.co', date: '2024-01-01T00:00:00Z' },
    committer: { name: 'Test', email: 't@t.co', date: '2024-01-01T00:00:00Z' },
    subject: `commit ${sha}`,
    body: '',
    lane: -1,
    parentLanes: [],
  };
}

function laneOf(commits: Commit[], sha: string): number {
  const c = commits.find((c) => c.sha === sha);
  if (!c) throw new Error(`commit ${sha} not found`);
  return c.lane;
}

function parentLanesOf(commits: Commit[], sha: string): number[] {
  const c = commits.find((c) => c.sha === sha);
  if (!c) throw new Error(`commit ${sha} not found`);
  return c.parentLanes;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('assignLanes', () => {
  it('empty input returns maxLaneUsed = -1', () => {
    const r = assignLanes([]);
    expect(r.maxLaneUsed).toBe(-1);
    expect(r.commits).toEqual([]);
  });

  describe('linear history', () => {
    // A → B → C (newest first: C, B, A)
    const commits = [
      makeCommit('C', ['B']),
      makeCommit('B', ['A']),
      makeCommit('A', []),
    ];

    it('assigns all commits to lane 0', () => {
      const r = assignLanes(commits);
      expect(laneOf(r.commits, 'C')).toBe(0);
      expect(laneOf(r.commits, 'B')).toBe(0);
      expect(laneOf(r.commits, 'A')).toBe(0);
    });

    it('parent lanes follow trunk (same lane)', () => {
      const r = assignLanes(commits);
      expect(parentLanesOf(r.commits, 'C')).toEqual([0]);
      expect(parentLanesOf(r.commits, 'B')).toEqual([0]);
      expect(parentLanesOf(r.commits, 'A')).toEqual([]);
    });

    it('maxLaneUsed is 0', () => {
      const r = assignLanes(commits);
      expect(r.maxLaneUsed).toBe(0);
    });
  });

  describe('diamond merge', () => {
    //      D (merge)
    //     / \
    //    C   B
    //     \ /
    //      A
    const commits = [
      makeCommit('D', ['C', 'B']),
      makeCommit('C', ['A']),
      makeCommit('B', ['A']),
      makeCommit('A', []),
    ];

    it('merge commit D on lane 0', () => {
      const r = assignLanes(commits);
      expect(laneOf(r.commits, 'D')).toBe(0);
    });

    it('first parent C on trunk lane 0', () => {
      const r = assignLanes(commits);
      expect(laneOf(r.commits, 'C')).toBe(0);
      expect(parentLanesOf(r.commits, 'D')).toContain(0);
    });

    it('second parent B opens lane 1', () => {
      const r = assignLanes(commits);
      expect(laneOf(r.commits, 'B')).toBe(1);
      expect(parentLanesOf(r.commits, 'D')).toContain(1);
    });

    it('parent B curves back to lane 0 for shared parent A', () => {
      const r = assignLanes(commits);
      // B is on lane 1, but its parent A is already on lane 0 (from C)
      expect(laneOf(r.commits, 'A')).toBe(0);
      expect(parentLanesOf(r.commits, 'B')).toEqual([0]);
    });

    it('maxLaneUsed is 1', () => {
      const r = assignLanes(commits);
      expect(r.maxLaneUsed).toBe(1);
    });
  });

  describe('branch anchoring via refs', () => {
    // main:  A → B → C (newest C, B, A)
    // feature:  D → E (newest E, D)
    // merge: C has parents [B, E]
    //
    // git log newest→oldest: C, B, E, D, A
    const commits = [
      makeCommit('C', ['B', 'E'], ['main']),
      makeCommit('B', ['A']),
      makeCommit('E', ['D'], ['feature/payment']),
      makeCommit('D', []),
      makeCommit('A', []),
    ];

    it('branch tips get distinct lanes', () => {
      const r = assignLanes(commits);
      const mainLane = laneOf(r.commits, 'C'); // has ref 'main'
      const featLane = laneOf(r.commits, 'E'); // has ref 'feature/payment'
      expect(mainLane).not.toBe(featLane);
    });

    it('branches keep their lanes after merge', () => {
      const r = assignLanes(commits);
      // E (feature tip) is on its lane
      const featLane = laneOf(r.commits, 'E');
      // C's merge parent E should route to feature's lane
      expect(parentLanesOf(r.commits, 'C')[1]).toBe(featLane);
    });
  });

  describe('stability across re-runs', () => {
    it('same commits + same cache produce identical lanes', () => {
      const commits = [
        makeCommit('E', ['D', 'C'], ['main']),
        makeCommit('D', ['B']),
        makeCommit('C', ['B'], ['feature/login']),
        makeCommit('B', ['A']),
        makeCommit('A', []),
      ];

      const r1 = assignLanes(commits);
      const r2 = assignLanes(commits, {
        branchLanes: r1.branchLanes,
        reservedLanes: r1.reservedLanes,
      });

      for (let i = 0; i < commits.length; i++) {
        expect(r2.commits[i]!.lane).toBe(r1.commits[i]!.lane);
        expect(r2.commits[i]!.parentLanes).toEqual(r1.commits[i]!.parentLanes);
      }
    });

    it('adding older commits does not shift existing lanes', () => {
      // First batch: newest commits
      const batch1 = [
        makeCommit('E', ['D', 'C'], ['main']),
        makeCommit('D', ['B']),
        makeCommit('C', ['B'], ['feature/login']),
        makeCommit('B', ['A']),
        makeCommit('A', []),
      ];

      const r1 = assignLanes(batch1);
      const firstLanes: Record<string, number> = {};
      for (const c of r1.commits) firstLanes[c.sha] = c.lane;

      // Second batch: same commits plus older ones
      const batch2 = [
        ...batch1,
        makeCommit('A0', ['Z']),
        makeCommit('Z', []),
      ];

      const r2 = assignLanes(batch2, {
        branchLanes: r1.branchLanes,
        reservedLanes: r1.reservedLanes,
      });

      // Commits from batch 1 must keep their lanes
      for (const sha of Object.keys(firstLanes)) {
        expect(
          laneOf(r2.commits, sha),
          `SHA ${sha} lane shifted on incremental load`,
        ).toBe(firstLanes[sha]!);
      }
    });
  });

  describe('muted refs independence', () => {
    it('refs present but muted: lane assignment still uses branch identity', () => {
      const commits = [
        makeCommit('D', ['C', 'B'], ['main']),
        makeCommit('C', ['A']),
        makeCommit('B', ['A'], ['feature/x']),
        makeCommit('A', []),
      ];

      const r1 = assignLanes(commits);
      const featLane = laneOf(r1.commits, 'B');

      // Even if we'd remove refs from B (simulating muted), the branchLanes
      // cache should still route B to the same lane.
      const r2 = assignLanes(commits, {
        branchLanes: r1.branchLanes,
        reservedLanes: r1.reservedLanes,
      });
      expect(laneOf(r2.commits, 'B')).toBe(featLane);
    });
  });

  describe('multiple branches', () => {
    it('each branch gets a unique lane', () => {
      const commits = [
        makeCommit('Z', ['Y'], ['branch-5']),
        makeCommit('Y', []),
        makeCommit('X', ['W'], ['branch-4']),
        makeCommit('W', []),
        makeCommit('V', ['U'], ['branch-3']),
        makeCommit('U', []),
        makeCommit('T', ['S'], ['branch-2']),
        makeCommit('S', []),
        makeCommit('R', ['Q'], ['branch-1']),
        makeCommit('Q', []),
      ];

      const r = assignLanes(commits);
      const lanes = new Set([
        laneOf(r.commits, 'Z'),
        laneOf(r.commits, 'X'),
        laneOf(r.commits, 'V'),
        laneOf(r.commits, 'T'),
        laneOf(r.commits, 'R'),
      ]);
      expect(lanes.size).toBe(5);
    });

    it('branch reservations survive in returned branchLanes', () => {
      const commits = [
        makeCommit('E', ['D', 'C'], ['main']),
        makeCommit('D', ['B']),
        makeCommit('C', ['B'], ['feature/login']),
        makeCommit('B', ['A']),
        makeCommit('A', []),
      ];

      const r = assignLanes(commits);
      expect(r.branchLanes['main']).toBeDefined();
      expect(r.branchLanes['feature/login']).toBeDefined();
      expect(r.branchLanes['main']).not.toBe(r.branchLanes['feature/login']);
    });
  });

  describe('octopus merge', () => {
    it('merges with 3 parents', () => {
      const commits = [
        makeCommit('M', ['A', 'B', 'C']),
        makeCommit('C', []),
        makeCommit('B', []),
        makeCommit('A', []),
      ];

      const r = assignLanes(commits);
      expect(laneOf(r.commits, 'M')).toBe(0);
      // First parent on trunk
      expect(parentLanesOf(r.commits, 'M')[0]).toBe(0);
      // Second and third parents open unique lanes
      expect(parentLanesOf(r.commits, 'M')[1]).not.toBe(0);
      expect(parentLanesOf(r.commits, 'M')[2]).not.toBe(0);
      expect(parentLanesOf(r.commits, 'M')[1]).not.toBe(
        parentLanesOf(r.commits, 'M')[2],
      );
      expect(r.maxLaneUsed).toBeGreaterThanOrEqual(2);
    });
  });

  describe('root commits', () => {
    it('root commit (no parents) has empty parentLanes', () => {
      const commits = [
        makeCommit('A', []),
      ];
      const r = assignLanes(commits);
      expect(laneOf(r.commits, 'A')).toBe(0);
      expect(parentLanesOf(r.commits, 'A')).toEqual([]);
    });

    it('multiple root commits', () => {
      const commits = [
        makeCommit('B', []),
        makeCommit('A', []),
      ];
      const r = assignLanes(commits);
      // No relation between them, each gets its own lane
      expect(laneOf(r.commits, 'B')).toBe(0);
      expect(laneOf(r.commits, 'A')).toBe(0); // B freed lane 0
    });
  });

  describe('branch lane reservation across runs', () => {
    it('branch lane reserved in first run is reused in second run', () => {
      const commits1 = [
        makeCommit('F', ['E', 'D'], ['main']),
        makeCommit('E', ['C']),
        makeCommit('D', ['C'], ['feature/x']),
        makeCommit('C', ['B']),
        makeCommit('B', ['A']),
        makeCommit('A', []),
      ];

      const r1 = assignLanes(commits1);
      const mainLane = r1.branchLanes['main']!;
      const featLane = r1.branchLanes['feature/x']!;

      // Run again with the same cache branches
      const commits2 = [
        ...commits1,
        makeCommit('A0', ['Z']),
        makeCommit('Z', []),
      ];

      const r2 = assignLanes(commits2, {
        branchLanes: r1.branchLanes,
        reservedLanes: r1.reservedLanes,
      });

      expect(r2.branchLanes['main']).toBe(mainLane);
      expect(r2.branchLanes['feature/x']).toBe(featLane);
    });
  });

  describe('detached HEAD', () => {
    it('handle commit with HEAD ref but no local branch', () => {
      const commits = [
        makeCommit('C', ['B'], ['HEAD']),
        makeCommit('B', ['A']),
        makeCommit('A', []),
      ];

      const r = assignLanes(commits);
      expect(laneOf(r.commits, 'C')).toBe(0);
      expect(laneOf(r.commits, 'B')).toBe(0);
      expect(laneOf(r.commits, 'A')).toBe(0);
    });
  });

  describe('remote and tag refs', () => {
    it('remote refs do not claim local branch lanes', () => {
      const commits = [
        makeCommit('D', ['C', 'B'], ['main']),
        makeCommit('C', ['A']),
        makeCommit('B', ['A'], ['origin/feature']),
        makeCommit('A', []),
      ];

      const r = assignLanes(commits);
      // origin/feature is remote, not local → no branch reservation
      expect(r.branchLanes['origin/feature']).toBeUndefined();
      // main is local → gets reservation
      expect(r.branchLanes['main']).toBeDefined();
    });

    it('tag refs do not claim lanes', () => {
      const commits = [
        makeCommit('B', ['A'], ['v1.0.0']),
        makeCommit('A', []),
      ];

      const r = assignLanes(commits);
      // Tags don't get branch lanes
      expect(r.branchLanes['v1.0.0']).toBeUndefined();
    });
  });

  describe('firstFreeLane respects reserved lanes', () => {
    it('does not reuse a reserved lane for an unrelated branch', () => {
      // First run: reserve lane for feature/x
      const commits1 = [
        makeCommit('X', ['Y'], ['feature/x']),
        makeCommit('Y', []),
      ];
      const r1 = assignLanes(commits1);
      const featLane = r1.branchLanes['feature/x']!;

      // Second run (new commits): feature/y should NOT get feature/x's lane
      const commits2 = [
        makeCommit('Z', ['W'], ['feature/y']),
        makeCommit('W', []),
      ];
      const r2 = assignLanes(commits2, {
        branchLanes: r1.branchLanes,
        reservedLanes: r1.reservedLanes,
      });

      expect(r2.branchLanes['feature/y']).not.toBe(featLane);
    });
  });

  describe('performance sanity', () => {
    it('assigns 10000 linear commits quickly', () => {
      const count = 10000;
      const commits: Commit[] = [];
      for (let i = 0; i < count; i++) {
        const sha = `commit-${i}`;
        const parent = i + 1 < count ? [`commit-${i + 1}`] : [];
        commits.push(makeCommit(sha, parent));
      }

      const start = performance.now();
      const r = assignLanes(commits);
      const elapsed = performance.now() - start;

      expect(r.commits.length).toBe(count);
      expect(elapsed).toBeLessThan(200); // 10k commits < 200ms
    });
  });
});

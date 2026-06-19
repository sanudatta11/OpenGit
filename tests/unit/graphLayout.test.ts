import { describe, expect, it } from 'vitest';
import { compileGraphLayout } from '../../src/graph/layout';
import type { Commit, RefKind } from '../../shared/git';

function makeCommit(sha: string, parents: string[] = [], refs: Array<{ kind: RefKind; shortName: string; isHead?: boolean }> = []): Commit {
  return {
    sha,
    parents: Object.freeze(parents),
    refs: Object.freeze(refs.map((ref) => ({ ...ref, isHead: ref.isHead ?? false }))),
    author: { name: 'Test', email: 't@t.co', date: '2024-01-01T00:00:00Z' },
    committer: { name: 'Test', email: 't@t.co', date: '2024-01-01T00:00:00Z' },
    subject: `commit ${sha}`,
    body: '',
  };
}

function rowBySha(result: ReturnType<typeof compileGraphLayout>, sha: string) {
  const row = result.rows.find((entry) => entry.sha === sha);
  if (!row) throw new Error(`row ${sha} not found`);
  return row;
}

describe('compileGraphLayout', () => {
  it('returns an empty layout for empty input', () => {
    const result = compileGraphLayout([]);
    expect(result.rows).toEqual([]);
    expect(result.maxLane).toBe(-1);
  });

  it('keeps linear history on lane 0 with vertical segments', () => {
    const commits = [
      makeCommit('C', ['B']),
      makeCommit('B', ['A']),
      makeCommit('A'),
    ];

    const result = compileGraphLayout(commits);

    expect(rowBySha(result, 'C').node.lane).toBe(0);
    expect(rowBySha(result, 'B').node.lane).toBe(0);
    expect(rowBySha(result, 'A').node.lane).toBe(0);
    expect(rowBySha(result, 'A').node.kind).toBe('root');
    expect(rowBySha(result, 'C').edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'vertical', fromLane: 0, toLane: 0 }),
      ]),
    );
  });

  it('renders branch-out and merge-in segments for a diamond merge', () => {
    const commits = [
      makeCommit('D', ['C', 'B'], [{ kind: 'local', shortName: 'main' }]),
      makeCommit('C', ['A']),
      makeCommit('B', ['A'], [{ kind: 'local', shortName: 'feature/login' }]),
      makeCommit('A'),
    ];

    const result = compileGraphLayout(commits);

    expect(rowBySha(result, 'D').node.kind).toBe('merge');
    expect(rowBySha(result, 'D').node.lane).toBe(0);
    expect(rowBySha(result, 'B').node.lane).toBe(1);
    expect(rowBySha(result, 'D').activeLanes).toEqual([0, 1]);
    expect(rowBySha(result, 'D').edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'branch-out', fromLane: 0, toLane: 1 }),
      ]),
    );
    expect(rowBySha(result, 'B').edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'merge-in', fromLane: 1, toLane: 0 }),
      ]),
    );
  });

  it('keeps a long-lived local branch on a stable side lane across recompiles', () => {
    const batch1 = [
      makeCommit('E', ['D', 'C'], [{ kind: 'local', shortName: 'main' }]),
      makeCommit('D', ['B']),
      makeCommit('C', ['B'], [{ kind: 'local', shortName: 'feature/x' }]),
      makeCommit('B', ['A']),
      makeCommit('A'),
    ];

    const first = compileGraphLayout(batch1);
    const second = compileGraphLayout([
      ...batch1,
      makeCommit('A0', ['Z']),
      makeCommit('Z'),
    ]);

    for (const sha of ['E', 'D', 'C', 'B', 'A']) {
      expect(rowBySha(second, sha).node.lane).toBe(rowBySha(first, sha).node.lane);
    }
    expect(rowBySha(first, 'C').node.lane).toBe(1);
  });

  it('classifies a HEAD-only commit as detached-head', () => {
    const result = compileGraphLayout([
      makeCommit('C', ['B'], [{ kind: 'HEAD', shortName: 'HEAD', isHead: true }]),
      makeCommit('B', ['A']),
      makeCommit('A'),
    ]);

    expect(rowBySha(result, 'C').node.kind).toBe('detached-head');
    expect(rowBySha(result, 'C').node.lane).toBe(0);
  });

  it('groups refs into head, branches, and tags for row rendering', () => {
    const result = compileGraphLayout([
      makeCommit('B', ['A'], [
        { kind: 'HEAD', shortName: 'HEAD', isHead: true },
        { kind: 'local', shortName: 'main' },
        { kind: 'remote', shortName: 'origin/main' },
        { kind: 'tag', shortName: 'v1.0.0' },
      ]),
      makeCommit('A'),
    ]);

    const row = rowBySha(result, 'B');
    expect(row.refs.head?.shortName).toBe('HEAD');
    expect(row.refs.branches.map((ref) => ref.shortName)).toEqual(['main', 'origin/main']);
    expect(row.refs.tags.map((ref) => ref.shortName)).toEqual(['v1.0.0']);
  });

  it('does not reserve a side lane for remote-only refs', () => {
    const result = compileGraphLayout([
      makeCommit('D', ['C', 'B'], [{ kind: 'local', shortName: 'main' }]),
      makeCommit('C', ['A']),
      makeCommit('B', ['A'], [{ kind: 'remote', shortName: 'origin/feature/x' }]),
      makeCommit('A'),
    ]);

    expect(rowBySha(result, 'B').node.lane).toBe(1);
    expect(rowBySha(result, 'B').node.colorKey).toBe('sha:B');
  });

  it('creates distinct side lanes for octopus merge parents', () => {
    const result = compileGraphLayout([
      makeCommit('M', ['A', 'B', 'C'], [{ kind: 'local', shortName: 'main' }]),
      makeCommit('C'),
      makeCommit('B'),
      makeCommit('A'),
    ]);

    const mergeRow = rowBySha(result, 'M');
    const sideEdges = mergeRow.edges.filter((edge) => edge.kind === 'branch-out');

    expect(mergeRow.node.kind).toBe('merge');
    expect(sideEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fromLane: 0, toLane: 1 }),
        expect.objectContaining({ fromLane: 0, toLane: 2 }),
      ]),
    );
    expect(result.maxLane).toBeGreaterThanOrEqual(2);
  });
});

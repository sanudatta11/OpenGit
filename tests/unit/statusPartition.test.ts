import { describe, expect, it } from 'vitest';
import { partitionStatusEntries } from '../../src/components/commit/model';
import type { StatusEntry } from '@shared/git';

function entry(partial: Partial<StatusEntry> & Pick<StatusEntry, 'path' | 'kind'>): StatusEntry {
  return {
    oldPath: null,
    indexStatus: 'unmodified',
    worktreeStatus: 'unmodified',
    modeIndex: null,
    modeWorktree: null,
    blobIndex: null,
    blobWorktree: null,
    staged: false,
    unstaged: false,
    ...partial,
  };
}

describe('partitionStatusEntries', () => {
  const entries = [
    entry({ path: 'a.ts', kind: 'modified', staged: true }),
    entry({ path: 'b.ts', kind: 'modified', unstaged: true }),
    entry({ path: 'c.ts', kind: 'untracked', unstaged: true }),
    entry({ path: 'd.ts', kind: 'unmerged', staged: true, unstaged: true }),
  ];

  it('partitions all categories for WorkingTree', () => {
    const parts = partitionStatusEntries(entries);
    expect(parts.staged.map((e) => e.path)).toEqual(['a.ts', 'd.ts']);
    expect(parts.unstaged.map((e) => e.path)).toEqual(['b.ts', 'c.ts', 'd.ts']);
    expect(parts.untracked.map((e) => e.path)).toEqual(['c.ts']);
    expect(parts.conflicts.map((e) => e.path)).toEqual(['d.ts']);
  });

  it('can exclude conflicts from staged/unstaged lists for FileChanges', () => {
    const parts = partitionStatusEntries(entries, { excludeConflictsFromLists: true });
    expect(parts.staged.map((e) => e.path)).toEqual(['a.ts']);
    expect(parts.unstaged.map((e) => e.path)).toEqual(['b.ts', 'c.ts']);
    expect(parts.conflicts.map((e) => e.path)).toEqual(['d.ts']);
  });
});

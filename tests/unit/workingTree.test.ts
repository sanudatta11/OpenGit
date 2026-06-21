import { describe, expect, it } from 'vitest';
import type { StatusEntry } from '../../shared/git';
import {
  buildCommitMessage,
  buildPathTree,
  comparePaths,
  getFileActionEligibility,
  canCreateCommit,
  resolvePushTarget,
  summarizeWip,
} from '../../src/components/commit/model';

function entry(path: string, overrides: Partial<StatusEntry> = {}): StatusEntry {
  return {
    path,
    oldPath: null,
    indexStatus: 'unmodified',
    worktreeStatus: 'modified',
    modeIndex: null,
    modeWorktree: null,
    blobIndex: null,
    blobWorktree: null,
    kind: 'modified',
    staged: false,
    unstaged: true,
    ...overrides,
  };
}

describe('buildCommitMessage', () => {
  it('joins summary and description with a blank line', () => {
    expect(buildCommitMessage('feat: add staging', 'Detailed body')).toBe('feat: add staging\n\nDetailed body');
  });

  it('returns just the summary when the description is empty', () => {
    expect(buildCommitMessage('fix: bug', '   ')).toBe('fix: bug');
  });
});

describe('comparePaths', () => {
  it('sorts naturally and case-insensitively in either direction', () => {
    const paths = ['src/File10.ts', 'README.md', 'src/file2.ts'];
    expect([...paths].sort((a, b) => comparePaths(a, b, 'asc'))).toEqual([
      'README.md', 'src/file2.ts', 'src/File10.ts',
    ]);
    expect([...paths].sort((a, b) => comparePaths(a, b, 'desc'))).toEqual([
      'src/File10.ts', 'src/file2.ts', 'README.md',
    ]);
  });
});

describe('buildPathTree', () => {
  it('groups normalized paths with folders before files', () => {
    const tree = buildPathTree([
      entry('README.md'),
      entry('src\\components\\Panel.tsx'),
      entry('src/App.tsx'),
    ], 'asc');

    expect(tree.map((node) => [node.kind, node.name])).toEqual([
      ['folder', 'src'],
      ['file', 'README.md'],
    ]);
    expect(tree[0]?.kind === 'folder' ? tree[0].children.map((node) => node.name) : []).toEqual([
      'components', 'App.tsx',
    ]);
  });
});

describe('summarizeWip', () => {
  it('counts unique changed paths and separates additions from modifications', () => {
    const summary = summarizeWip([
      entry('partial.ts', { staged: true, unstaged: true }),
      entry('new.ts', { kind: 'untracked', worktreeStatus: 'untracked' }),
      entry('partial.ts', { staged: true, unstaged: true }),
    ]);

    expect(summary).toEqual({ files: 2, additions: 1, modifications: 1 });
  });
});

describe('getFileActionEligibility', () => {
  it('uses list context for partially staged files', () => {
    const partial = entry('partial.ts', { staged: true, unstaged: true });
    expect(getFileActionEligibility(partial, 'unstaged')).toEqual({
      canStage: true,
      canUnstage: false,
      canDiscard: true,
    });
    expect(getFileActionEligibility(partial, 'staged')).toEqual({
      canStage: false,
      canUnstage: true,
      canDiscard: false,
    });
  });
});

describe('commit action policy', () => {
  it('allows amend without staged files but blocks conflicts and empty summaries', () => {
    expect(canCreateCommit({ summary: 'fix: amend', stagedCount: 0, amend: true, hasConflicts: false, pending: false })).toBe(true);
    expect(canCreateCommit({ summary: 'fix: blocked', stagedCount: 1, amend: false, hasConflicts: true, pending: false })).toBe(false);
    expect(canCreateCommit({ summary: '  ', stagedCount: 1, amend: false, hasConflicts: false, pending: false })).toBe(false);
  });

  it('uses upstream when present and falls back to origin with upstream setup', () => {
    expect(resolvePushTarget({ shortName: 'feature', upstream: 'fork/topic' })).toEqual({ remote: 'fork', branch: 'topic', setUpstream: false });
    expect(resolvePushTarget({ shortName: 'feature', upstream: null })).toEqual({ remote: 'origin', branch: 'feature', setUpstream: true });
  });
});

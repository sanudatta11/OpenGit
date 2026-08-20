import { describe, expect, it } from 'vitest';
import { filterCommitsByQuery, parseSearchQuery } from '../../src/graph/searchQuery';
import type { Commit } from '@shared/git';

function commit(partial: Partial<Commit> & Pick<Commit, 'sha' | 'subject'>): Commit {
  return {
    parents: [],
    body: '',
    author: { name: 'Alice', email: 'a@example.com', date: '2024-01-01' },
    committer: { name: 'Alice', email: 'a@example.com', date: '2024-01-01' },
    refs: [],
    ...partial,
  };
}

describe('parseSearchQuery', () => {
  it('parses prefixed tokens and free-text message', () => {
    expect(parseSearchQuery('author:Alice branch:main file:src/a.ts hash:abc fix login')).toEqual({
      author: 'alice',
      branch: 'main',
      file: 'src/a.ts',
      hash: 'abc',
      message: 'fix login',
    });
  });

  it('returns empty object for blank query', () => {
    expect(parseSearchQuery('   ')).toEqual({});
  });
});

describe('filterCommitsByQuery', () => {
  const commits = [
    commit({
      sha: 'abcdef1',
      subject: 'Fix login',
      author: { name: 'Alice', email: 'alice@ex.com', date: '1' },
      refs: [{ kind: 'local', shortName: 'main', isHead: true }],
    }),
    commit({
      sha: 'fedcba2',
      subject: 'Add docs',
      author: { name: 'Bob', email: 'bob@ex.com', date: '2' },
      refs: [{ kind: 'local', shortName: 'feature', isHead: false }],
    }),
  ];

  it('filters by author and message', () => {
    expect(filterCommitsByQuery(commits, parseSearchQuery('author:alice')).map((c) => c.sha)).toEqual(['abcdef1']);
    expect(filterCommitsByQuery(commits, parseSearchQuery('docs')).map((c) => c.sha)).toEqual(['fedcba2']);
  });

  it('filters by branch and hash prefix', () => {
    expect(filterCommitsByQuery(commits, parseSearchQuery('branch:feat')).map((c) => c.sha)).toEqual(['fedcba2']);
    expect(filterCommitsByQuery(commits, parseSearchQuery('hash:abc')).map((c) => c.sha)).toEqual(['abcdef1']);
  });
});

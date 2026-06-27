import { describe, expect, it } from 'vitest';
import { rankKnownRepos, type KnownRepoEntry } from '../../src/components/dashboard/search';

const entries: KnownRepoEntry[] = [
  {
    path: '/work/OpenGit',
    name: 'OpenGit',
    isOpen: false,
    recencyRank: 2,
  },
  {
    path: '/work/OpenGit-Docs',
    name: 'OpenGit-Docs',
    isOpen: true,
    recencyRank: 5,
  },
  {
    path: '/archive/git-experiments',
    name: 'git-experiments',
    isOpen: false,
    recencyRank: 0,
  },
];

describe('rankKnownRepos', () => {
  it('prefers exact name prefixes over weaker path-only matches', () => {
    const ranked = rankKnownRepos(entries, 'opengit');
    expect(ranked[0]?.name).toBe('OpenGit');
  });

  it('boosts open repositories when textual quality is similar', () => {
    const ranked = rankKnownRepos([
      { path: '/work/alpha-service', name: 'alpha-service', isOpen: false, recencyRank: 1 },
      { path: '/work/alpha-staging', name: 'alpha-staging', isOpen: true, recencyRank: 1 },
    ], 'alpha');
    expect(ranked[0]?.name).toBe('alpha-staging');
  });

  it('uses recency to break ties between similar matches', () => {
    const ranked = rankKnownRepos([
      { path: '/work/foo-client', name: 'foo-client', isOpen: false, recencyRank: 1 },
      { path: '/work/foo-server', name: 'foo-server', isOpen: false, recencyRank: 4 },
    ], 'foo');
    expect(ranked[0]?.name).toBe('foo-server');
  });

  it('returns all known repos when the query is empty', () => {
    expect(rankKnownRepos(entries, '')).toHaveLength(3);
  });
});

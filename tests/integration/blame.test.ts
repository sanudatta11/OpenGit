// tests/integration/blame.test.ts — A.19 Blame operations.
// Uses the full fixture repo.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestRepo, cleanupTestRepo, type TestRepo,
} from './helpers';
import { getBlame } from '../../electron/main/git/operations';

let repo: TestRepo;

beforeAll(async () => {
  repo = await setupTestRepo();
}, 60_000);

afterAll(() => {
  cleanupTestRepo(repo.root);
});

describe('getBlame', () => {
  it('A.19.1 returns per-line blame entries', async () => {
    const blame = await getBlame(repo.main, 'src/auth.ts');
    expect(blame.length).toBeGreaterThan(0);
    expect(blame[0]!).toHaveProperty('sha');
    expect(blame[0]!).toHaveProperty('author');
    expect(blame[0]!).toHaveProperty('line');
  });

  it('A.19.2 blames at a specific ref', async () => {
    const blame = await getBlame(repo.main, 'src/auth.ts', 'HEAD~2');
    expect(blame.length).toBeGreaterThan(0);
  });

  it('A.19.3 returns empty for nonexistent file', async () => {
    const blame = await getBlame(repo.main, 'nope.ts');
    expect(blame.length).toBe(0);
  });
});

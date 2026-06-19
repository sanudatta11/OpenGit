// tests/integration/compare.test.ts — A.20 Branch comparison.
// Uses the full fixture repo.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestRepo, cleanupTestRepo, type TestRepo,
} from './helpers';
import { compareBranches } from '../../electron/main/git/compare';

let repo: TestRepo;

beforeAll(async () => {
  repo = await setupTestRepo();
}, 60_000);

afterAll(() => {
  cleanupTestRepo(repo.root);
});

describe('compareBranches', () => {
  it('A.20.1 reports ahead/behind counts', async () => {
    const r = await compareBranches(repo.main, 'main', 'feature/ahead-test');
    expect(r.aheadCount).toBeGreaterThanOrEqual(2); // ahead-test has 2 commits
    expect(r.behindCount).toBeGreaterThanOrEqual(0);
  });

  it('A.20.2 lists file changes', async () => {
    const r = await compareBranches(repo.main, 'main', 'feature/ahead-test');
    expect(r.files.length).toBeGreaterThanOrEqual(1);
    expect(r.files.some(f => f.path === 'ahead.txt')).toBe(true);
  });

  it('A.20.3 identical branches have zero counts', async () => {
    const r = await compareBranches(repo.main, 'main', 'main');
    expect(r.aheadCount).toBe(0);
    expect(r.behindCount).toBe(0);
    expect(r.files.length).toBe(0);
  });

  it('A.20.4 compares remote branch', async () => {
    const r = await compareBranches(repo.main, 'origin/main', 'feature/login');
    expect(r).toBeDefined();
    expect(typeof r.aheadCount).toBe('number');
    expect(typeof r.behindCount).toBe('number');
  });
});

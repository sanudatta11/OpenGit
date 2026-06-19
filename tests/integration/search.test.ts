// tests/integration/search.test.ts — A.22 Repository search tests.
// Uses the full fixture repo.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import {
  setupTestRepo, cleanupTestRepo, type TestRepo,
} from './helpers';
import { searchRepository } from '../../electron/main/git/repo';

let repo: TestRepo;
let gitDir: string;

beforeAll(async () => {
  repo = await setupTestRepo();
  gitDir = join(repo.main, '.git');
}, 60_000);

afterAll(() => {
  cleanupTestRepo(repo.root);
});

describe('searchRepository', () => {
  it('A.22.1 searches for branches by name', async () => {
    const results = await searchRepository(repo.main, gitDir, 'feature', 50);
    expect(results.some(r => r.kind === 'branch' && r.label.includes('feature'))).toBe(true);
  });

  it('A.22.2 searches for commits by subject', async () => {
    const results = await searchRepository(repo.main, gitDir, 'login', 50);
    expect(results.some(r => r.kind === 'commit' && r.label.toLowerCase().includes('login'))).toBe(true);
  });

  it('A.22.4 searches for files', async () => {
    const results = await searchRepository(repo.main, gitDir, 'src/', 50);
    expect(results.some(r => r.kind === 'file' && r.label.startsWith('src/'))).toBe(true);
  });

  it('A.22.5 empty query returns results up to limit', async () => {
    const results = await searchRepository(repo.main, gitDir, '', 5);
    expect(results.length).toBeLessThanOrEqual(5);
    expect(results.length).toBeGreaterThan(0);
  });

  it('A.22.6 limit is respected', async () => {
    const results = await searchRepository(repo.main, gitDir, '', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('A.22.7 no matches returns empty array', async () => {
    const results = await searchRepository(repo.main, gitDir, 'zzzzz_nonexistent_xxxxx', 50);
    expect(results.length).toBe(0);
  });
});

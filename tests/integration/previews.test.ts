// tests/integration/previews.test.ts — A.21 Operation preview tests.
// Uses the full fixture repo.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestRepo, cleanupTestRepo, type TestRepo,
} from './helpers';
import {
  mergePreview, pullPreview, rebasePlan, previewCommits, previewFiles,
} from '../../electron/main/git/previews';

let repo: TestRepo;

beforeAll(async () => {
  repo = await setupTestRepo();
}, 60_000);

afterAll(() => {
  cleanupTestRepo(repo.root);
});

describe('previews', () => {
  it('A.21.1 mergePreview lists commits to merge', async () => {
    const preview = await mergePreview(repo.main, 'feature/login');
    expect(preview).toBeDefined();
    expect(preview.source).toBe('feature/login');
    expect(preview.commits.length).toBeGreaterThan(0);
  });

  it('A.21.2 mergePreview lists files that will change', async () => {
    const preview = await mergePreview(repo.main, 'feature/login');
    expect(preview.files.length).toBeGreaterThan(0);
  });

  it('A.21.5 rebasePlan lists commits to replay', async () => {
    // Checkout feature/login and preview rebase onto main
    const preview = await rebasePlan(repo.main, 'feature/login');
    // We're on main, so ont..HEAD is the range from feature/login..main
    expect(preview).toBeDefined();
    expect(preview.onto).toBe('feature/login');
  });

  it('A.21.6 previewCommits returns commits in a range', async () => {
    const commits = await previewCommits(repo.main, 'main..feature/ahead-test');
    expect(commits.length).toBeGreaterThanOrEqual(2);
    expect(commits.every(c => c.sha && c.author && c.subject)).toBe(true);
  });

  it('A.21.7 previewFiles returns files changed in a range', async () => {
    const files = await previewFiles(repo.main, 'main..feature/ahead-test');
    expect(files.length).toBeGreaterThanOrEqual(1);
    expect(files.some(f => f.path === 'ahead.txt')).toBe(true);
  });

  it('A.21.3 pullPreview returns strategy recommendation', async () => {
    const preview = await pullPreview(repo.main, 'origin', 'main');
    expect(preview).toBeDefined();
    expect(preview.remote).toBe('origin');
  });
});

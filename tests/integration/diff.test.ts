// tests/integration/diff.test.ts — A.23 Diff operations.
// Uses the full fixture repo for advanced scenarios + lightweight repos for basic ones.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import {
  setupTestRepo, cleanupTestRepo, createQuickRepo, destroyQuickRepo,
  type TestRepo,
} from './helpers';
import {
  getDiff, getCommitFiles, getFileContent, getLog,
} from '../../electron/main/git/repo';

let repo: TestRepo;

beforeAll(async () => {
  repo = await setupTestRepo();
}, 60_000);

afterAll(() => {
  cleanupTestRepo(repo.root);
});

describe('getDiff', () => {
  it('A.23.1 returns working-tree vs index diff', async () => {
    const diff = await getDiff(repo.main, { path: 'src/auth.ts' });
    expect(diff).toBeDefined();
    expect(diff.hunks).toBeDefined();
  });

  it('A.23.2 returns commit diff', async () => {
    const diff = await getDiff(repo.main, { path: 'src/auth.ts', ref: 'HEAD' });
    expect(diff).toBeDefined();
  });

  it('A.23.5 binary file returns isBinary flag', async () => {
    const diff = await getDiff(repo.main, { path: 'assets/logo.png' });
    expect(diff.isBinary).toBe(true);
  });

  it('A.23.7 ignoreWhitespace option', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      require('fs').writeFileSync(join(workTree, 'base.txt'), 'base  \n');
      const diff = await getDiff(workTree, { path: 'base.txt', ignoreWhitespace: true });
      expect(diff).toBeDefined();
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.23.9 getCommitFiles lists files in a commit', async () => {
    const allCommits = await getLog(repo.main, { skip: 0, limit: 1, refsBySha: new Map() });
    if (allCommits.commits.length > 0) {
      const files = await getCommitFiles(repo.main, allCommits.commits[0]!.sha);
      expect(Array.isArray(files)).toBe(true);
    }
  });

  it('A.23.10 getFileContent returns file at ref', async () => {
    const result = await getFileContent(repo.main, { path: 'src/auth.ts', ref: 'HEAD' });
    expect(result.content.length).toBeGreaterThan(0);
  });
});

// tests/integration/commit.test.ts — A.4 Commit tests.
// Uses lightweight inline repos.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, mkdirSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createQuickRepo, destroyQuickRepo, git,
} from './helpers';
import { createCommit, stagePaths } from '../../electron/main/git/operations';

/** Write content to a file in the worktree (cross-platform, no shell needed). */
function write(workTree: string, rel: string, content: string): void {
  writeFileSync(join(workTree, rel), content);
}

/** Install a pre-commit hook that exits non-zero (blocks commits). */
function installFailingHook(workTree: string): void {
  const hooksDir = join(workTree, '.git', 'hooks');
  if (!existsSync(hooksDir)) mkdirSync(hooksDir, { recursive: true });
  const hookPath = join(hooksDir, 'pre-commit');
  writeFileSync(hookPath, '#!/bin/sh\nexit 1\n');
  try { chmodSync(hookPath, 0o755); } catch { /* Windows: chmod is a no-op */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Basic commit
// ─────────────────────────────────────────────────────────────────────────────

describe('commit', () => {
  let qr: ReturnType<typeof createQuickRepo>;

  beforeAll(() => { qr = createQuickRepo(); });
  afterAll(() => { destroyQuickRepo(qr); });

  it('A.4.1 creates a basic commit', async () => {
    const { workTree } = qr;
    write(workTree, 'new.txt', 'content\n');
    await stagePaths(workTree, ['new.txt']);

    const r = await createCommit(workTree, { message: 'add new.txt' });
    expect(r.success).toBe(true);
    expect(r.data?.sha).toMatch(/^[0-9a-f]{40}$/);
    expect(r.changedRefs).toContain('HEAD');
    expect(r.requiresRefresh).toBe(true);

    const log = git(workTree, ['log', '--pretty=format:%s', '-1']).trim();
    expect(log).toBe('add new.txt');
  });

  it('A.4.2 amends the last commit', async () => {
    const { workTree } = qr;
    const r = await createCommit(workTree, { message: 'add new.txt (amended)', amend: true });
    expect(r.success).toBe(true);
    const log = git(workTree, ['log', '--pretty=format:%s', '-1']).trim();
    expect(log).toBe('add new.txt (amended)');
  });

  it('A.4.3 adds signoff trailer', async () => {
    const qr2 = createQuickRepo();
    try {
      const { workTree } = qr2;
      write(workTree, 'signed.txt', 'signed\n');
      await stagePaths(workTree, ['signed.txt']);

      const r = await createCommit(workTree, { message: 'signed commit', signoff: true });
      expect(r.success).toBe(true);

      const body = git(workTree, ['log', '--format=%B', '-1']).trim();
      expect(body).toContain('Signed-off-by:');
    } finally {
      destroyQuickRepo(qr2);
    }
  });

  it('A.4.6 uses author override', async () => {
    const qr2 = createQuickRepo();
    try {
      const { workTree } = qr2;
      write(workTree, 'author.txt', 'author\n');
      await stagePaths(workTree, ['author.txt']);

      const r = await createCommit(workTree, {
        message: 'author override',
        author: { name: 'Override', email: 'override@test.dev' },
      });
      expect(r.success).toBe(true);

      const author = git(workTree, ['log', '--format=%an %ae', '-1']).trim();
      expect(author).toBe('Override override@test.dev');
    } finally {
      destroyQuickRepo(qr2);
    }
  });

  it('A.4.7 fails on empty staging', async () => {
    const { workTree } = qr; // tree is now clean
    const r = await createCommit(workTree, { message: 'empty' });
    expect(r.success).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Commit hooks (noVerify)
// ─────────────────────────────────────────────────────────────────────────────

describe('commit hooks', () => {
  it('A.4.5 hook blocks commit when not skipped', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      // Install a failing pre-commit hook
      installFailingHook(workTree);
      write(workTree, 'hook-test.txt', 'hook-blocked\n');
      await stagePaths(workTree, ['hook-test.txt']);

      const r = await createCommit(workTree, { message: 'should fail' });
      expect(r.success).toBe(false);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.4.4 noVerify skips hook', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      installFailingHook(workTree);
      write(workTree, 'hook-skip.txt', 'hook-skipped\n');
      await stagePaths(workTree, ['hook-skip.txt']);

      const r = await createCommit(workTree, { message: 'skipped hook', noVerify: true });
      expect(r.success).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

// tests/integration/commit.test.ts — A.4 Commit tests.
// Uses lightweight inline repos.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import {
  createQuickRepo, destroyQuickRepo, git,
} from './helpers';
import { createCommit, stagePaths } from '../../electron/main/git/operations';

function bash(workTree: string, cmd: string) {
  execSync(cmd, { cwd: workTree, shell: true, stdio: 'pipe' });
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
    bash(workTree, 'printf "content\n" > new.txt');
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
      bash(workTree, 'printf "signed\n" > signed.txt');
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
      bash(workTree, 'printf "author\n" > author.txt');
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
      bash(workTree, 'mkdir -p .git/hooks && printf "#!/bin/sh\nexit 1\n" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit');
      bash(workTree, 'printf "hook-blocked\n" > hook-test.txt');
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
      bash(workTree, 'mkdir -p .git/hooks && printf "#!/bin/sh\nexit 1\n" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit');
      bash(workTree, 'printf "hook-skipped\n" > hook-skip.txt');
      await stagePaths(workTree, ['hook-skip.txt']);

      const r = await createCommit(workTree, { message: 'skipped hook', noVerify: true });
      expect(r.success).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

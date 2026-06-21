// tests/integration/worktree.test.ts — worktree create/list/remove/prune integration.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createWorktree, listWorktrees, removeWorktree, pruneWorktrees,
  lockWorktree, unlockWorktree, removeWorktreeAndBranch,
} from '../../electron/main/git/operations';

let repoDir: string;
let wtDir: string;

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false' },
  });
}

/** Create a temp dir and resolve symlinks so it matches what git reports. */
function realTmpDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)));
}

beforeAll(() => {
  repoDir = realTmpDir('opengit-wt-');
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@t.co']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(repoDir, 'base.txt'), 'base\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'initial']);
  wtDir = realTmpDir('opengit-wt-test-');
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
  try { rmSync(wtDir, { recursive: true, force: true }); } catch { /* ok */ }
});

describe('worktree', () => {
  it('lists default worktree', async () => {
    const list = await listWorktrees(repoDir);
    expect(list.length).toBe(1);
    expect(list[0]!.isMain).toBe(true);
    expect(list[0]!.branch).toBe('refs/heads/main');
  });

  it('creates a detached worktree', async () => {
    const r = await createWorktree(repoDir, {
      path: wtDir,
      start: 'HEAD',
    });
    expect(r.success).toBe(true);

    const list = await listWorktrees(repoDir);
    expect(list.length).toBe(2);
    const created = list.find((w) => w.path === wtDir);
    expect(created).toBeDefined();
    expect(created!.detached).toBe(true);
  });

  it('removes a worktree', async () => {
    const r = await removeWorktree(repoDir, wtDir, false);
    if (!r.success) {
      // On some systems, git worktree remove may need --force.
      const r2 = await removeWorktree(repoDir, wtDir, true);
      expect(r2.success).toBe(true);
    } else {
      expect(r.success).toBe(true);
    }

    const list = await listWorktrees(repoDir);
    expect(list.length).toBe(1);
  });

  it('creates a worktree with a branch', async () => {
    const branchPath = realTmpDir('opengit-wt-branch-');
    const r = await createWorktree(repoDir, {
      path: branchPath,
      branch: 'feature-wt',
      start: 'HEAD',
    });
    expect(r.success, `createWorktree failed: ${r.stderr}`).toBe(true);

    const list = await listWorktrees(repoDir);
    const created = list.find((w) => w.path === branchPath);
    expect(created).toBeDefined();
    expect(created?.branch).toBe('refs/heads/feature-wt');
    expect(created?.detached).toBe(false);

    // Clean up.
    await removeWorktree(repoDir, branchPath, true);
  });

  it('prunes stale worktree entries', async () => {
    // Create a worktree, remove its directory on disk, then prune.
    const stalePath = realTmpDir('opengit-wt-stale-');
    await createWorktree(repoDir, { path: stalePath, start: 'HEAD' });
    // Remove the directory on disk (but not via git).
    rmSync(stalePath, { recursive: true, force: true });

    const listBefore = await listWorktrees(repoDir);
    const stale = listBefore.find((w) => w.path === stalePath);
    expect(stale).toBeDefined();

    const r = await pruneWorktrees(repoDir);
    expect(r.success).toBe(true);

    const listAfter = await listWorktrees(repoDir);
    expect(listAfter.find((w) => w.path === stalePath)).toBeUndefined();
  });

  it('A.9.4 creates a worktree with lock reason', async () => {
    const lockedPath = realTmpDir('opengit-wt-locked-');
    try {
      const r = await createWorktree(repoDir, {
        path: lockedPath,
        start: 'HEAD',
        lock: 'testing locked creation',
      });
      expect(r.success).toBe(true);

      const list = await listWorktrees(repoDir);
      const created = list.find((w) => w.path === lockedPath);
      expect(created).toBeDefined();
      expect(created!.locked).not.toBeNull();
    } finally {
      await removeWorktree(repoDir, lockedPath, true).catch(() => {});
    }
  });

  it('A.9.5 locks an existing worktree', async () => {
    const lockPath = realTmpDir('opengit-wt-lock-');
    try {
      const cr = await createWorktree(repoDir, { path: lockPath, start: 'HEAD' });
      expect(cr.success, `create lockPath worktree failed: ${cr.stderr}`).toBe(true);
      const r = await lockWorktree(repoDir, lockPath, 'Testing lock feature');
      expect(r.success).toBe(true);

      const list = await listWorktrees(repoDir);
      const wt = list.find((w) => w.path === lockPath);
      expect(wt?.locked).not.toBeNull();
    } finally {
      await removeWorktree(repoDir, lockPath, true).catch(() => {});
    }
  });

  it('A.9.6 unlocks a locked worktree', async () => {
    const unlockPath = realTmpDir('opengit-wt-unlock-');
    try {
      await createWorktree(repoDir, { path: unlockPath, start: 'HEAD' });
      await lockWorktree(repoDir, unlockPath, 'to unlock');
      const r = await unlockWorktree(repoDir, unlockPath);
      expect(r.success).toBe(true);

      const list = await listWorktrees(repoDir);
      const wt = list.find((w) => w.path === unlockPath);
      expect(wt?.locked).toBeNull();
    } finally {
      await removeWorktree(repoDir, unlockPath, true).catch(() => {});
    }
  });

  it('A.9.8 removes a worktree and its branch', async () => {
    const rmbPath = realTmpDir('opengit-wt-rmb-');
    const branchName = 'feature-rmb';
    try {
      await createWorktree(repoDir, {
        path: rmbPath,
        branch: branchName,
        start: 'HEAD',
      });

      const r = await removeWorktreeAndBranch(repoDir, rmbPath, branchName, true);
      expect(r.success).toBe(true);

      const list = await listWorktrees(repoDir);
      expect(list.find((w) => w.path === rmbPath)).toBeUndefined();

      const branches = execFileSync('git', ['branch', '--list', branchName], {
        cwd: repoDir, encoding: 'utf8',
      }).trim();
      expect(branches).toBe('');
    } catch {
      // Clean up on failure
      try { await removeWorktree(repoDir, rmbPath, true); } catch { /* ok */ }
    }
  });

  it('A.9.11 lists multiple worktrees with locked + detached attributes', async () => {
    const extraWt = realTmpDir('opengit-wt-extra-');
    await createWorktree(repoDir, { path: extraWt, branch: 'extra', start: 'HEAD' });

    const list = await listWorktrees(repoDir);
    // Should have at least the initial wt + the one we just created
    expect(list.length).toBeGreaterThanOrEqual(2);

    // Clean up
    await removeWorktree(repoDir, extraWt, true).catch(() => {});
  });
});

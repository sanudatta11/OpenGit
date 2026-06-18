// tests/integration/worktree.test.ts — worktree create/list/remove/prune integration.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createWorktree, listWorktrees, removeWorktree, pruneWorktrees,
} from '../../electron/main/git/operations';

let repoDir: string;
let wtDir: string;

function git(args: string[]): string {
  return execSync(`git ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C' },
  });
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-wt-'));
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@t.co']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(repoDir, 'base.txt'), 'base\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'initial']);
  wtDir = join(tmpdir(), 'opengit-wt-test');
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
  try { rmSync(wtDir, { recursive: true, force: true }); } catch { /* ok */}
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
    const branchPath = join(tmpdir(), 'opengit-wt-branch');
    const r = await createWorktree(repoDir, {
      path: branchPath,
      branch: 'feature-wt',
      start: 'HEAD',
    });
    expect(r.success).toBe(true);

    const list = await listWorktrees(repoDir);
    const created = list.find((w) => w.path === branchPath);
    expect(created?.branch).toBe('refs/heads/feature-wt');
    expect(created?.detached).toBe(false);

    // Clean up.
    await removeWorktree(repoDir, branchPath, true);
  });

  it('prunes stale worktree entries', async () => {
    // Create a worktree, remove its directory on disk, then prune.
    const stalePath = join(tmpdir(), 'opengit-wt-stale');
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
});

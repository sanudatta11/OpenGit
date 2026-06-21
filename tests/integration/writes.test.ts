// tests/integration/writes.test.ts — integration test write flows against a real temp git repo.
// We can't easily test the full IPC round-trip without launching Electron, so we test the
// operation functions directly (which is what the IPC handlers call).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  stagePaths, unstagePaths, discardPaths, discardUntracked,
  createCommit, checkoutBranch, createBranch, deleteBranch,
} from '../../electron/main/git/operations';
import { getStatus } from '../../electron/main/git/repo';

let repoDir: string;

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false' },
  });
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-write-'));
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@t.co']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(repoDir, 'a.txt'), 'a\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'initial']);
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe('stage / unstage', () => {
  it('stages a modified file', async () => {
    writeFileSync(join(repoDir, 'a.txt'), 'a\nmodified\n');
    const statusBefore = await getStatus(repoDir, join(repoDir, '.git'));
    expect(statusBefore.entries.some((e) => e.path === 'a.txt' && !e.staged && e.unstaged)).toBe(true);

    const r = await stagePaths(repoDir, ['a.txt']);
    expect(r.success).toBe(true);

    const statusAfter = await getStatus(repoDir, join(repoDir, '.git'));
    const a = statusAfter.entries.find((e) => e.path === 'a.txt');
    expect(a?.staged).toBe(true);
  });

  it('unstages a staged file', async () => {
    const r = await unstagePaths(repoDir, ['a.txt']);
    expect(r.success).toBe(true);

    const status = await getStatus(repoDir, join(repoDir, '.git'));
    const a = status.entries.find((e) => e.path === 'a.txt');
    expect(a?.staged).toBe(false);
    expect(a?.unstaged).toBe(true);
  });
});

describe('discard', () => {
  it('discards worktree changes to a tracked file', async () => {
    writeFileSync(join(repoDir, 'a.txt'), 'a\ndiscarded\n');
    const r = await discardPaths(repoDir, ['a.txt']);
    expect(r.success).toBe(true);
    expect(readFileSync(join(repoDir, 'a.txt'), 'utf8')).toBe('a\n');
  });

  it('removes untracked files via discardUntracked', async () => {
    writeFileSync(join(repoDir, 'temp.txt'), 'temp\n');
    expect(existsSync(join(repoDir, 'temp.txt'))).toBe(true);
    const r = await discardUntracked(repoDir, ['temp.txt']);
    expect(r.success).toBe(true);
    expect(existsSync(join(repoDir, 'temp.txt'))).toBe(false);
  });
});

describe('commit', () => {
  it('creates a commit with a message', async () => {
    writeFileSync(join(repoDir, 'b.txt'), 'b\n');
    await stagePaths(repoDir, ['b.txt']);
    const r = await createCommit(repoDir, { message: 'add b.txt' });
    expect(r.success).toBe(true);
    expect(r.data?.sha).toMatch(/^[0-9a-f]{40}$/);

    const log = git(['log', '--pretty=format:%s', '-1']);
    expect(log.trim()).toBe('add b.txt');
  });

  it('amends the last commit', async () => {
    const r = await createCommit(repoDir, { message: 'add b.txt (amended)', amend: true });
    expect(r.success).toBe(true);
    const log = git(['log', '--pretty=format:%s', '-1']);
    expect(log.trim()).toBe('add b.txt (amended)');
  });
});

describe('branch operations', () => {
  it('creates a branch without checking out', async () => {
    const r = await createBranch(repoDir, 'feature', 'HEAD', false);
    expect(r.success).toBe(true);
    const branches = git(['branch', '--list', 'feature']);
    expect(branches).toContain('feature');
  });

  it('creates and checks out a branch', async () => {
    const r = await createBranch(repoDir, 'dev', 'HEAD', true);
    expect(r.success).toBe(true);
    const current = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    expect(current).toBe('dev');
  });

  it('checks out an existing branch', async () => {
    const r = await checkoutBranch(repoDir, 'main');
    expect(r.success).toBe(true);
    const current = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    expect(current).toBe('main');
  });

  it('deletes a branch (not current)', async () => {
    const r = await deleteBranch(repoDir, 'feature', false);
    expect(r.success).toBe(true);
    const branches = git(['branch', '--list', 'feature']);
    expect(branches.trim()).toBe('');
  });
});

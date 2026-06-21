// tests/integration/merge.test.ts — A.13 Merge operations.
// Uses lightweight inline repos with beforeEach isolation.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mergeBranch } from '../../electron/main/git/operations';

let repoDir: string;

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false' },
  });
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-merge-'));
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
  mkdirSync(repoDir, { recursive: true });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@t.co']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(repoDir, 'base.txt'), 'base\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'base']);
});

describe('merge', () => {
  it('A.13.1 fast-forwards when possible', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'f.txt'), 'f\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'feature commit']);
    git(['checkout', '-q', 'main']);

    const r = await mergeBranch(repoDir, { ref: 'feature' });
    expect(r.success).toBe(true);
    expect(r.data?.fastForward).toBe(true);
    expect(r.data?.conflicts).toEqual([]);
    expect(existsSync(join(repoDir, 'f.txt'))).toBe(true);
  });

  it('A.13.2 creates a merge commit with --no-ff', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'f.txt'), 'f\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'feature commit']);
    git(['checkout', '-q', 'main']);
    writeFileSync(join(repoDir, 'm.txt'), 'm\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'main commit']);

    const r = await mergeBranch(repoDir, { ref: 'feature', noFf: true });
    expect(r.success).toBe(true);
    expect(r.data?.fastForward).toBe(false);
    const log = git(['log', '--pretty=format:%s', '-1']);
    expect(log).toContain('Merge');
  });

  it('A.13.3 squash merge', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'f.txt'), 'f\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'feature commit']);
    git(['checkout', '-q', 'main']);

    const r = await mergeBranch(repoDir, { ref: 'feature', squash: true });
    expect(r.success).toBe(true);
    // Squash leaves changes staged but no commit created unless --no-commit is implied
    const log = git(['log', '--pretty=format:%s', '-1']);
    expect(log).toBe('base'); // no merge commit
  });

  it('A.13.4 noCommit leaves changes staged', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'f.txt'), 'f\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'feature commit']);
    git(['checkout', '-q', 'main']);

    const r = await mergeBranch(repoDir, { ref: 'feature', noCommit: true, noFf: true });
    expect(r.success).toBe(true);
    const log = git(['log', '--pretty=format:%s', '-1']);
    expect(log).toBe('base'); // no merge commit
    const status = git(['status', '--porcelain']);
    expect(status).toContain('A  f.txt'); // staged as new file
  });

  it('A.13.5 detects merge conflicts', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'base.txt'), 'feature\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'change on feature']);
    git(['checkout', '-q', 'main']);
    writeFileSync(join(repoDir, 'base.txt'), 'main\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'change on main']);

    const r = await mergeBranch(repoDir, { ref: 'feature', noFf: true });
    expect(r.success).toBe(false);
    expect(r.data?.conflicts).toContain('base.txt');
  });

  it('A.13.6 returns failure for nonexistent ref', async () => {
    const r = await mergeBranch(repoDir, { ref: 'nope' });
    expect(r.success).toBe(false);
  });
});

// tests/integration/cherry-pick.test.ts — A.16 Cherry-pick & revert.
// Uses lightweight inline repos with beforeEach isolation.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { cherryPick, revertCommits } from '../../electron/main/git/operations';

let repoDir: string;

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false' },
  });
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-cp-'));
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

describe('cherry-pick', () => {
  it('A.16.1 cherry-picks a commit onto current branch', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'feature.txt'), 'feature\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'feature commit']);
    const sha = git(['rev-parse', 'HEAD']).trim();
    git(['checkout', '-q', 'main']);

    const r = await cherryPick(repoDir, [sha], false);
    expect(r.success).toBe(true);
    expect(existsSync(join(repoDir, 'feature.txt'))).toBe(true);
    const log = git(['log', '--pretty=format:%s', '-1']).trim();
    expect(log).toContain('feature commit');
  });

  it('A.16.2 cherry-pick with no-commit leaves changes staged', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'feature.txt'), 'feature\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'feature commit']);
    const sha = git(['rev-parse', 'HEAD']).trim();
    git(['checkout', '-q', 'main']);

    const r = await cherryPick(repoDir, [sha], true);
    expect(r.success).toBe(true);
    const status = git(['status', '--porcelain']);
    expect(status).toContain('A  feature.txt'); // staged
    expect(git(['log', '--pretty=format:%s', '-1']).trim()).toBe('base');
  });

  it('A.16.4 cherry-picks multiple commits in order', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    const shas: string[] = [];
    for (const msg of ['cherry A', 'cherry B']) {
      writeFileSync(join(repoDir, `${msg}.txt`), msg);
      git(['add', '.']);
      git(['commit', '-q', '-m', msg]);
      shas.push(git(['rev-parse', 'HEAD']).trim());
    }
    git(['checkout', '-q', 'main']);

    const r = await cherryPick(repoDir, shas, false);
    expect(r.success).toBe(true);
    const subjects = git(['log', '--pretty=format:%s', '-2']).trim().split('\n');
    expect(subjects[0]).toContain('cherry B');
    expect(subjects[1]).toContain('cherry A');
  });
});

describe('revert', () => {
  it('A.16.5 reverts a commit', async () => {
    writeFileSync(join(repoDir, 'to-revert.txt'), 'content\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'add file']);
    const sha = git(['rev-parse', 'HEAD']).trim();

    const r = await revertCommits(repoDir, [sha], false);
    expect(r.success).toBe(true);
    expect(existsSync(join(repoDir, 'to-revert.txt'))).toBe(false);
    const log = git(['log', '--pretty=format:%s', '-1']).trim().toLowerCase();
    expect(log).toContain('revert');
  });

  it('A.16.6 revert with no-commit leaves reverse changes staged', async () => {
    writeFileSync(join(repoDir, 'to-rev.txt'), 'content\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'add to-rev']);
    const sha = git(['rev-parse', 'HEAD']).trim();

    const r = await revertCommits(repoDir, [sha], true);
    expect(r.success).toBe(true);
    const status = git(['status', '--porcelain']);
    expect(status).toContain('D  to-rev.txt');
  });
});

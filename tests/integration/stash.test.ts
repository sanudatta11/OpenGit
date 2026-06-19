// tests/integration/stash.test.ts — A.8 Stash operations.
// Uses lightweight inline repos with beforeEach isolation.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createStash, listStashes, applyStash, popStash, dropStash,
} from '../../electron/main/git/operations';
import { stashDiff } from '../../electron/main/git/operations';

let repoDir: string;

function git(args: string[]): string {
  return execSync(`git ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C' },
  });
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-stash-'));
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

describe('stash', () => {
  it('A.8.1 creates and lists a stash', async () => {
    writeFileSync(join(repoDir, 'base.txt'), 'modified\n');
    const r = await createStash(repoDir, { message: 'my stash' });
    expect(r.success).toBe(true);

    const list = await listStashes(repoDir);
    expect(list.length).toBe(1);
    expect(list[0]!.subject).toContain('my stash');
  });

  it('A.8.2 noChanges when worktree is clean', async () => {
    const r = await createStash(repoDir, { message: 'empty' });
    expect(r.success).toBe(true);
    const list = await listStashes(repoDir);
    expect(list.length).toBe(0);
  });

  it('A.8.3 includes untracked files', async () => {
    writeFileSync(join(repoDir, 'untracked.txt'), 'untracked\n');
    const r = await createStash(repoDir, { includeUntracked: true });
    expect(r.success).toBe(true);
    expect(existsSync(join(repoDir, 'untracked.txt'))).toBe(false);

    await applyStash(repoDir, 'stash@{0}', false);
    expect(existsSync(join(repoDir, 'untracked.txt'))).toBe(true);
  });

  it('A.8.5 applies a stash', async () => {
    writeFileSync(join(repoDir, 'base.txt'), 'stashed content\n');
    await createStash(repoDir, { message: 'to apply' });
    expect(require('fs').readFileSync(join(repoDir, 'base.txt'), 'utf8')).toBe('base\n');

    const r = await applyStash(repoDir, 'stash@{0}', false);
    expect(r.success).toBe(true);
    expect(require('fs').readFileSync(join(repoDir, 'base.txt'), 'utf8')).toBe('stashed content\n');
  });

  it('A.8.6 pops a stash', async () => {
    writeFileSync(join(repoDir, 'base.txt'), 'modified\n');
    await createStash(repoDir, { message: 'to pop' });
    expect((await listStashes(repoDir)).length).toBe(1);

    const r = await popStash(repoDir, 'stash@{0}', false);
    expect(r.success).toBe(true);
    expect((await listStashes(repoDir)).length).toBe(0);
    expect(require('fs').readFileSync(join(repoDir, 'base.txt'), 'utf8')).toBe('modified\n');
  });

  it('A.8.7 drops a stash', async () => {
    writeFileSync(join(repoDir, 'base.txt'), 'modified\n');
    await createStash(repoDir, { message: 'to drop' });
    expect((await listStashes(repoDir)).length).toBe(1);

    const r = await dropStash(repoDir, 'stash@{0}');
    expect(r.success).toBe(true);
    expect((await listStashes(repoDir)).length).toBe(0);
  });

  it('A.8.8 stashDiff returns unified diff', async () => {
    writeFileSync(join(repoDir, 'base.txt'), 'stashed for diff\n');
    await createStash(repoDir, { message: 'diff test' });

    const diff = await stashDiff(repoDir, 'stash@{0}');
    expect(diff.length).toBeGreaterThan(0);
    expect(diff).toContain('stashed for diff');
  });

  it('A.8.9 apply on dirty tree conflicts', async () => {
    writeFileSync(join(repoDir, 'base.txt'), 'stashed value\n');
    await createStash(repoDir, { message: 'conflict' });

    // Now modify the same file differently
    writeFileSync(join(repoDir, 'base.txt'), 'different value\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'different edit']);

    const r = await applyStash(repoDir, 'stash@{0}', false);
    expect(r.success).toBe(false); // should conflict
  });

  it('A.8.10 fails on nonexistent stash ref', async () => {
    const r = await applyStash(repoDir, 'stash@{99}', false);
    expect(r.success).toBe(false);
  });
});

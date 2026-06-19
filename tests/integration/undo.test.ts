// tests/integration/undo.test.ts — A.18 Undo operations (per-kind matrix).
// Uses lightweight inline repos with beforeEach isolation.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  undoAction, createCommit, createBranch,
  createStash, mergeBranch, stagePaths,
} from '../../electron/main/git/operations';

let repoDir: string;

function git(args: string[]): string {
  return execSync(`git ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C' },
  });
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-undo-'));
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

function initRepo(): void {
  rmSync(repoDir, { recursive: true, force: true });
  mkdirSync(repoDir, { recursive: true });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@t.co']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(repoDir, 'base.txt'), 'base\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'initial']);
}

describe('undo', () => {
  it('A.18.1 undoes a commit', async () => {
    initRepo();
    writeFileSync(join(repoDir, 'c.txt'), 'c\n');
    await stagePaths(repoDir, ['c.txt']);
    const before = git(['rev-parse', 'HEAD']).trim();

    const commitR = await createCommit(repoDir, { message: 'add c' });
    expect(commitR.success).toBe(true);

    const r = await undoAction(repoDir, { kind: 'commit' });
    expect(r.success).toBe(true);

    const after = git(['rev-parse', 'HEAD']).trim();
    expect(after).toBe(before);
  });

  it('A.18.2 undoes a merge', async () => {
    initRepo();
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'f.txt'), 'f\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'feature']);
    git(['checkout', '-q', 'main']);
    await mergeBranch(repoDir, { ref: 'feature', noFf: true });

    const r = await undoAction(repoDir, { kind: 'merge' });
    expect(r.success).toBe(true);

    const log = git(['log', '--pretty=format:%s', '-1']).trim();
    expect(log).not.toContain('Merge');
  });

  it('A.18.6 undoes a branch create', async () => {
    initRepo();
    await createBranch(repoDir, 'to-undo', 'HEAD', false);
    expect(git(['branch', '--list', 'to-undo']).trim()).toBeTruthy();

    const r = await undoAction(repoDir, { kind: 'branch-create', branch: 'to-undo' });
    expect(r.success).toBe(true);
    expect(git(['branch', '--list', 'to-undo']).trim()).toBe('');
  });

  it('A.18.7 undoes a branch delete (recovers branch)', async () => {
    initRepo();
    await createBranch(repoDir, 'to-recover', 'HEAD', true);
    git(['checkout', 'main']);
    git(['branch', '-q', '-D', 'to-recover']);

    const r = await undoAction(repoDir, { kind: 'branch-delete', branch: 'to-recover' });
    expect(r.success).toBe(true);
    expect(git(['branch', '--list', 'to-recover']).trim()).toBeTruthy();
  });

  it('A.18.8 undoes a stash apply', async () => {
    initRepo();
    writeFileSync(join(repoDir, 'to-stash.txt'), 'stash me\n');
    await stagePaths(repoDir, ['to-stash.txt']);
    await createStash(repoDir, { message: 'to apply' });

    // Re-apply stash
    git(['update-ref', 'ORIG_HEAD', 'HEAD']);
    git(['stash', 'apply']);
    expect(readFileSync(join(repoDir, 'to-stash.txt'), 'utf8').trim()).toBe('stash me');

    // Now undo the apply
    const r = await undoAction(repoDir, { kind: 'stash-apply' });
    expect(r.success).toBe(true);
  });

  it('A.18.10 handles unknown kind gracefully', async () => {
    initRepo();
    git(['update-ref', 'ORIG_HEAD', 'HEAD']);
    const r = await undoAction(repoDir, { kind: 'unknown-kind' });
    // Falls through to reset --hard ORIG_HEAD
    expect(r.success).toBe(true);
  });
});

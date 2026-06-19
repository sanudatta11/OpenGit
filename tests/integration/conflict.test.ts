// tests/integration/conflict.test.ts — A.14 Conflict resolution tests.
// Uses lightweight inline repos with beforeEach isolation.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mergeBranch, getConflictVersions, continueOperation, stagePaths } from '../../electron/main/git/operations';

let repoDir: string;

function git(args: string[]): string {
  return execSync(`git ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C' },
  });
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-conf-'));
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
  writeFileSync(join(repoDir, 'another.txt'), 'another\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'base']);
});

describe('conflict resolution', () => {
  beforeEach(() => {
    // Create diverging branches
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'base.txt'), 'FEATURE_VERSION\n');
    writeFileSync(join(repoDir, 'only-on-feature.txt'), 'only on feature\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'feature changes']);
    git(['checkout', '-q', 'main']);
    writeFileSync(join(repoDir, 'base.txt'), 'MAIN_VERSION\n');
    writeFileSync(join(repoDir, 'only-on-main.txt'), 'only on main\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'main changes']);
  });

  it('A.14.1 getConflictVersions returns OURS content', async () => {
    // On main, merge feature → conflict on base.txt
    const mergeR = await mergeBranch(repoDir, { ref: 'feature' });
    expect(mergeR.success).toBe(false);
    expect(mergeR.data?.conflicts).toContain('base.txt');

    const versions = await getConflictVersions(repoDir, 'base.txt');
    expect(versions).toBeDefined();
    expect(versions.ours).toContain('MAIN_VERSION');
  });

  it('A.14.2 getConflictVersions returns THEIRS content', async () => {
    const mergeR = await mergeBranch(repoDir, { ref: 'feature' });
    expect(mergeR.success).toBe(false);

    const versions = await getConflictVersions(repoDir, 'base.txt');
    expect(versions).toBeDefined();
    expect(versions.theirs).toContain('FEATURE_VERSION');
  });

  it('A.14.4 resolving by staging OURS clears conflict', async () => {
    const mergeR = await mergeBranch(repoDir, { ref: 'feature' });
    expect(mergeR.success).toBe(false);

    // Write the OURS version and stage it
    writeFileSync(join(repoDir, 'base.txt'), 'MAIN_VERSION\n');
    await stagePaths(repoDir, ['base.txt']);

    const conflicts = git(['diff', '--name-only', '--diff-filter=U', '-z']);
    const conflictPaths = conflicts.trim() ? conflicts.split('\0') : [];
    expect(conflictPaths).not.toContain('base.txt');
  });

  it('A.14.5 continue merge after resolving conflicts', async () => {
    const mergeR = await mergeBranch(repoDir, { ref: 'feature' });
    expect(mergeR.success).toBe(false);

    // Resolve both conflicting files
    writeFileSync(join(repoDir, 'base.txt'), 'RESOLVED\n');
    await stagePaths(repoDir, ['base.txt']);

    const r = await continueOperation(repoDir, 'merge');
    expect(r.success).toBe(true);

    // No merge in progress
    expect(require('fs').existsSync(join(repoDir, '.git', 'MERGE_HEAD'))).toBe(false);
  });
});

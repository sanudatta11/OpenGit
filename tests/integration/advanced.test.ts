// tests/integration/advanced.test.ts — stash, merge, rebase, cherry-pick, in-progress ops.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createStash, listStashes, applyStash, dropStash,
  mergeBranch, rebaseBranch, cherryPick, revertCommits,
  abortOperation,
} from '../../electron/main/git/operations';
import { getStatus } from '../../electron/main/git/repo';
import { parseInProgressState } from '../../electron/main/git/parse/state';

let repoDir: string;

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false' },
  });
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-adv-'));
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@t.co']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

beforeEach(() => {
  // Reset to a clean base before each test.
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
  it('creates and lists a stash', async () => {
    writeFileSync(join(repoDir, 'base.txt'), 'modified\n');
    const r = await createStash(repoDir, { message: 'my stash' });
    expect(r.success).toBe(true);

    const list = await listStashes(repoDir);
    expect(list.length).toBe(1);
    expect(list[0]!.subject).toContain('my stash');
  });

  it('reports noChanges when worktree is clean', async () => {
    const r = await createStash(repoDir, { message: 'empty' });
    expect(r.success).toBe(true);
    const list = await listStashes(repoDir);
    expect(list.length).toBe(0);
  });

  it('applies a stash', async () => {
    writeFileSync(join(repoDir, 'base.txt'), 'stashed content\n');
    await createStash(repoDir, { message: 'to apply' });

    // File should be back to original after stash.
    expect(readFileSync(join(repoDir, 'base.txt'), 'utf8')).toBe('base\n');

    const r = await applyStash(repoDir, 'stash@{0}', false);
    expect(r.success).toBe(true);
    expect(readFileSync(join(repoDir, 'base.txt'), 'utf8')).toBe('stashed content\n');
  });

  it('drops a stash', async () => {
    writeFileSync(join(repoDir, 'base.txt'), 'modified\n');
    await createStash(repoDir, { message: 'to drop' });
    expect((await listStashes(repoDir)).length).toBe(1);

    const r = await dropStash(repoDir, 'stash@{0}');
    expect(r.success).toBe(true);
    expect((await listStashes(repoDir)).length).toBe(0);
  });

  it('includes untracked files when requested', async () => {
    writeFileSync(join(repoDir, 'untracked.txt'), 'untracked\n');
    const r = await createStash(repoDir, { includeUntracked: true });
    expect(r.success).toBe(true);
    expect(existsSync(join(repoDir, 'untracked.txt'))).toBe(false);

    await applyStash(repoDir, 'stash@{0}', false);
    expect(existsSync(join(repoDir, 'untracked.txt'))).toBe(true);
  });
});

describe('merge', () => {
  it('fast-forwards when possible', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'f.txt'), 'f\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'feature commit']);
    git(['checkout', '-q', 'main']);

    const r = await mergeBranch(repoDir, { ref: 'feature' });
    expect(r.success).toBe(true);
    expect(r.data?.fastForward).toBe(true);
    expect(existsSync(join(repoDir, 'f.txt'))).toBe(true);
  });

  it('creates a merge commit with --no-ff', async () => {
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

  it('detects merge conflicts', async () => {
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
});

describe('rebase', () => {
  it('aborts a conflicted rebase', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'base.txt'), 'feature\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'change on feature']);
    git(['checkout', '-q', 'main']);
    writeFileSync(join(repoDir, 'base.txt'), 'main\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'change on main']);

    const _r = await rebaseBranch(repoDir, { onto: 'main' });
    // After checkout to feature for rebase... wait, we're on main. Rebase main onto main is no-op.
    // Actually we need to be on feature to rebase onto main. Let me fix the test setup.
    // The test above checks out main last. We need to checkout feature first.
    void _r;
    git(['checkout', '-q', 'feature']);
    const r2 = await rebaseBranch(repoDir, { onto: 'main' });
    expect(r2.success).toBe(false);
    expect(r2.data?.conflicts).toContain('base.txt');

    // Now abort.
    const abort = await abortOperation(repoDir, 'rebase');
    expect(abort.success).toBe(true);

    // Should be back on feature with no rebase in progress.
    const states = parseInProgressState(join(repoDir, '.git'), repoDir);
    expect(states.find((s) => s.kind === 'rebase')).toBeUndefined();
  });
});

describe('cherry-pick', () => {
  it('cherry-picks a commit onto the current branch', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'feature.txt'), 'feature\n');
    git(['add', '.']);
    const featureSha = git(['commit', '-q', '-m', 'feature commit']).trim();
    const sha = git(['rev-parse', 'HEAD']).trim();
    void featureSha;
    git(['checkout', '-q', 'main']);

    const r = await cherryPick(repoDir, [sha], false);
    expect(r.success).toBe(true);
    expect(existsSync(join(repoDir, 'feature.txt'))).toBe(true);
    const log = git(['log', '--pretty=format:%s', '-1']);
    expect(log).toContain('feature commit');
  });
});

describe('revert', () => {
  it('reverts a commit', async () => {
    writeFileSync(join(repoDir, 'to-revert.txt'), 'content\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'add file']);
    const sha = git(['rev-parse', 'HEAD']).trim();

    const r = await revertCommits(repoDir, [sha], false);
    expect(r.success).toBe(true);
    expect(existsSync(join(repoDir, 'to-revert.txt'))).toBe(false);
    const log = git(['log', '--pretty=format:%s', '-1']);
    expect(log.toLowerCase()).toContain('revert');
  });
});

describe('in-progress state detection', () => {
  it('detects merge in progress', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'base.txt'), 'feature\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'change']);
    git(['checkout', '-q', 'main']);
    writeFileSync(join(repoDir, 'base.txt'), 'main\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'main change']);

    // Start a merge that will conflict.
    try { git(['merge', '--no-ff', 'feature']); } catch { /* conflict expected */ }

    const states = parseInProgressState(join(repoDir, '.git'), repoDir);
    const merge = states.find((s) => s.kind === 'merge');
    expect(merge).toBeDefined();
    expect(merge!.canAbort).toBe(true);

    // Abort and verify clean.
    const r = await abortOperation(repoDir, 'merge');
    expect(r.success).toBe(true);
    const after = parseInProgressState(join(repoDir, '.git'), repoDir);
    expect(after.find((s) => s.kind === 'merge')).toBeUndefined();
  });

  it('getStatus includes in-progress states', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'base.txt'), 'feature\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'change']);
    git(['checkout', '-q', 'main']);
    writeFileSync(join(repoDir, 'base.txt'), 'main\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'main change']);
    try { git(['merge', '--no-ff', 'feature']); } catch { /* conflict */ }

    const status = await getStatus(repoDir, join(repoDir, '.git'));
    expect(status.states.length).toBeGreaterThan(0);
    expect(status.states.some((s) => s.kind === 'merge')).toBe(true);
  });
});

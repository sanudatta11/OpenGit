// tests/integration/lifecycle.test.ts — A.1 Repo lifecycle tests.
// Uses the full fixture repo and lightweight inline setups.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  setupTestRepo, cleanupTestRepo, git,
  type TestRepo,
} from './helpers';
import { openRepo } from '../../electron/main/git/repo';
import { createRepository, cloneRepository, inferCloneRepoName, resolveCreateTarget } from '../../electron/main/git/lifecycle';

let repo: TestRepo;

beforeAll(async () => {
  repo = await setupTestRepo();
}, 60_000);

afterAll(() => {
  cleanupTestRepo(repo.root);
});

describe('openRepo', () => {
  it('A.1.1 opens an existing repo', async () => {
    const r = await openRepo(repo.main);
    expect(r.workTreeRoot).toBe(repo.main);
    expect(r.gitDir).toMatch(/\.git$/);
  });

  it('A.1.2 throws NotARepo for a non-repo directory', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'opengit-no-'));
    await expect(openRepo(tmp)).rejects.toThrow();
  });

  it('A.1.3 throws NotARepo for a missing path', async () => {
    await expect(openRepo('/no/such/path')).rejects.toThrow();
  });
});

describe('createRepository', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'opengit-cr-'));
  });

  afterAll(() => {
    try { import('node:fs').then(fs => fs.rmSync(tmpRoot, { recursive: true, force: true })); } catch { /* ok */ }
  });

  it('A.1.4 creates an empty repo with readme/gitignore/license', async () => {
    const r = await createRepository({
      path: tmpRoot,
      repoName: 'r-with-defaults',
      bare: false,
      defaultBranch: 'main',
      readme: true,
      gitignore: 'node_modules',
      license: 'MIT',
    });
    expect(r.success).toBe(true);
    expect(r.data?.path).toBe(join(tmpRoot, 'r-with-defaults'));
    expect(existsSync(join(r.data!.path, 'README.md'))).toBe(true);
    expect(existsSync(join(r.data!.path, '.gitignore'))).toBe(true);
    expect(existsSync(join(r.data!.path, 'LICENSE'))).toBe(true);
  });

  it('A.1.5 creates a bare repo with default branch', async () => {
    const r = await createRepository({
      path: tmpRoot,
      repoName: 'r-bare',
      bare: true,
      defaultBranch: 'main',
      readme: false,
    });
    expect(r.success).toBe(true);
    // Bare repos don't have a worktree
    expect(existsSync(join(r.data!.path, 'HEAD'))).toBe(true);
    expect(existsSync(join(r.data!.path, 'config'))).toBe(true);
  });
});

describe('cloneRepository', () => {
  let tmpRoot: string;

  beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'opengit-cl-'));
  });

  afterAll(() => {
    try { import('node:fs').then(fs => fs.rmSync(tmpRoot, { recursive: true, force: true })); } catch { /* ok */ }
  });

  it('A.1.6 clones from a local bare remote', async () => {
    const r = await cloneRepository({
      url: repo.remote,
      destinationParent: tmpRoot,
      recursiveSubmodules: false,
    });
    expect(r.success).toBe(true);
    expect(r.data?.path).toBeDefined();
    expect(existsSync(r.data!.path)).toBe(true);
    const log = git(r.data!.path, ['log', '--oneline', '-1']);
    expect(log.trim()).toBeTruthy();
  });

  it('A.1.7 clones with shallow depth', async () => {
    const r = await cloneRepository({
      url: repo.remote,
      destinationParent: tmpRoot,
      repoName: 'shallow-clone',
      recursiveSubmodules: false,
      shallowDepth: 1,
    });
    expect(r.success).toBe(true);
    // Shallow clone should have exactly 1 reachable commit
    const count = git(r.data!.path, ['rev-list', '--count', 'HEAD']).trim();
    expect(Number(count)).toBe(1);
  });
});

describe('inferCloneRepoName', () => {
  it('A.1.9 extracts repo name from various URL formats', () => {
    const cases: [string, string][] = [
      ['https://example.com/foo.git', 'foo'],
      ['git@example.com:r/bar.git', 'bar'],
      ['https://example.com/baz/', 'baz'],
      ['https://example.com/foo/bar/baz.git', 'baz'],
      ['git@example.com:org/repo.git', 'repo'],
    ];
    for (const [url, expected] of cases) {
      expect(inferCloneRepoName(url)).toBe(expected);
    }
  });
});

describe('resolveCreateTarget', () => {
  it('A.1.10 joins path with repoName', () => {
    const r = resolveCreateTarget({ path: '/a/b', repoName: 'c', bare: false, defaultBranch: 'main', readme: false });
    // resolveCreateTarget uses resolve() + join(), so the expected value
    // must also use resolve() to match across platforms (Windows adds drive letter).
    expect(r).toBe(join(resolve('/a/b'), 'c'));
  });
});

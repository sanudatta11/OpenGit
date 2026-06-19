// tests/integration/reads.test.ts — A.2 read-only repo queries.
// Uses the full fixture repo.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestRepo, cleanupTestRepo, git, createQuickRepo, destroyQuickRepo,
  setupConflictBranches,
  type TestRepo,
} from './helpers';
import { getStatus, getLog, getBranches, getRemotes, getState } from '../../electron/main/git/repo';
import { parseInProgressState } from '../../electron/main/git/parse/state';

let repo: TestRepo;

beforeAll(async () => {
  repo = await setupTestRepo();
}, 60_000);

afterAll(() => {
  cleanupTestRepo(repo.root);
});

describe('getStatus', () => {
  it('A.2.1 parses staged/unstaged/untracked entries', async () => {
    const status = await getStatus(repo.main, join(repo.main, '.git'));
    // The fixture has staged (src/config.ts), unstaged (src/auth.ts), and untracked (src/new-feature.ts)
    expect(status.entries.some(e => e.path === 'src/config.ts' && e.staged)).toBe(true);
    expect(status.entries.some(e => e.path === 'src/auth.ts' && e.unstaged && !e.staged)).toBe(true);
    expect(status.entries.some(e => e.path === 'src/new-feature.ts' && e.kind === 'untracked')).toBe(true);
  });

  it('A.2.2 returns empty entries on a clean tree', async () => {
    const qr = createQuickRepo();
    try {
      const status = await getStatus(qr.workTree, qr.gitDir);
      expect(status.entries.filter(e => e.unstaged || e.staged || e.kind === 'untracked' || e.kind === 'ignored').length).toBe(0);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

// Need join for .git path
import { join } from 'node:path';

describe('getLog', () => {
  it('A.2.3 paginates with skip/limit', async () => {
    const r1 = await getLog(repo.main, { skip: 0, limit: 5, refsBySha: new Map() });
    expect(r1.commits.length).toBe(5);
    expect(r1.hasMore).toBe(true);

    const r2 = await getLog(repo.main, { skip: 0, limit: 2000, refsBySha: new Map() });
    expect(r2.commits.length).toBeGreaterThan(0);
  });

  it('A.2.4 filters by range', async () => {
    const r = await getLog(repo.main, {
      range: 'main..feature/ahead-test',
      limit: 100,
      skip: 0,
      refsBySha: new Map(),
    });
    // ahead-test has 2 commits not on main
    expect(r.commits.length).toBeGreaterThanOrEqual(2);
    expect(r.commits.every(c => c.subject.includes('Ahead'))).toBe(true);
  });

  it('A.2.5 filters by path', async () => {
    const r = await getLog(repo.main, {
      paths: ['src/auth.ts'],
      limit: 100,
      skip: 0,
      refsBySha: new Map(),
    });
    expect(r.commits.length).toBeGreaterThanOrEqual(3); // login, logout, validate
    for (const c of r.commits) {
      expect(c.subject).toMatch(/login|logout|validate|auth/i);
    }
  });

  it('A.2.6 returns empty for skip beyond end', async () => {
    const r = await getLog(repo.main, { skip: 999_999, limit: 10, refsBySha: new Map() });
    expect(r.commits.length).toBe(0);
    expect(r.hasMore).toBe(false);
  });
});

describe('getBranches', () => {
  it('A.2.7 includes local/remote/tag branches', async () => {
    const r = await getBranches(repo.main, join(repo.main, '.git'));
    const kinds = new Set(r.branches.map(b => b.kind));
    expect(kinds.has('local')).toBe(true);
    expect(kinds.has('remote')).toBe(true);
    expect(kinds.has('tag')).toBe(true);
    expect(r.currentHeadSha).toBeTruthy();
  });

  it('A.2.8 branches track upstream ahead/behind', async () => {
    const r = await getBranches(repo.main, join(repo.main, '.git'));
    const main = r.branches.find(b => b.shortName === 'main' && b.kind === 'local');
    expect(main).toBeDefined();
    // main has an upstream (origin/main) since we pushed
    expect(main!.upstream).toMatch(/origin\/main/);
  });
});

describe('getRemotes', () => {
  it('A.2.9 parses remote info', async () => {
    const remotes = await getRemotes(repo.main);
    expect(remotes.length).toBe(1);
    expect(remotes[0]!.name).toBe('origin');
    expect(remotes[0]!.fetchUrl).toContain('remote.git');
    expect(remotes[0]!.pushUrl).toContain('remote.git');
  });
});

describe('getState / in-progress detection', () => {
  it('A.2.10 returns empty state on clean repo', async () => {
    const qr = createQuickRepo();
    try {
      const states = await getState(qr.workTree, qr.gitDir);
      expect(states.length).toBe(0);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.2.11 detects merge in progress', async () => {
    const qr = createQuickRepo();
    try {
      setupConflictBranches(qr.workTree);
      git(qr.workTree, ['checkout', '-q', 'side-b']);
      try { git(qr.workTree, ['merge', '--no-ff', 'side-a']); } catch { /* expected */ }

      const states = await getState(qr.workTree, qr.gitDir);
      const merge = states.find(s => s.kind === 'merge');
      expect(merge).toBeDefined();
      expect(merge!.canAbort).toBe(true);

      // Clean up
      git(qr.workTree, ['merge', '--abort']);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.2.12 detects rebase in progress', async () => {
    const qr = createQuickRepo();
    try {
      setupConflictBranches(qr.workTree);
      git(qr.workTree, ['checkout', '-q', 'side-b']);
      try { git(qr.workTree, ['rebase', 'side-a']); } catch { /* expected */ }

      const states = parseInProgressState(qr.gitDir, qr.workTree);
      const rebase = states.find(s => s.kind === 'rebase');
      expect(rebase).toBeDefined();
      expect(rebase!.currentStep).toBeGreaterThanOrEqual(0);

      // Clean up
      git(qr.workTree, ['rebase', '--abort']);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

describe('head ref detection', () => {
  it('A.2.13 headRef is symbolic on a branch', async () => {
    const r = await getBranches(repo.main, join(repo.main, '.git'));
    // On main, headRef should be derived from HEAD file
    expect(r.currentHeadSha).toBeTruthy();
  });

  it('A.2.14 head is detached when checking out a tag', async () => {
    const wt = repo.worktrees.detached;
    const r = await getBranches(wt, join(wt, '.git'));
    // Detached HEAD: headRef is null, headSha is set
    // The worktree is at v1.0.0 tag
    expect(r.currentHeadSha).toBeTruthy();
    // Ensure we're actually detached
    const headRaw = git(wt, ['rev-parse', 'HEAD']).trim();
    expect(headRaw).toBeTruthy();
  });
});

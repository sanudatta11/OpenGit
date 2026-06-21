// tests/integration/remotes.test.ts — A.6 Remote fetch/pull/push tests.
// Uses the full fixture repo for the remote + lightweight inline repos for local ops.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  setupTestRepo, cleanupTestRepo, git, createQuickRepo, destroyQuickRepo,
  type TestRepo,
} from './helpers';

/** Write content to a file in the worktree (cross-platform, no shell needed). */
function write(workTree: string, rel: string, content: string): void {
  writeFileSync(join(workTree, rel), content);
}
import {
  fetchRemote, fetchAllRemotes, pullRemote, pushRemote,
} from '../../electron/main/git/operations';

let repo: TestRepo;

beforeAll(async () => {
  repo = await setupTestRepo();
}, 60_000);

afterAll(() => {
  cleanupTestRepo(repo.root);
});

describe('fetchRemote', () => {
  it('A.6.1 fetches from origin', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      git(workTree, ['remote', 'add', 'origin', repo.remote]);

      const r = await fetchRemote(workTree, 'origin', true);
      expect(r.success).toBe(true);
      expect(r.changedRefs).toContain('refs/remotes');
      expect(r.requiresRefresh).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.6.3 returns failure for unknown remote', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      const r = await fetchRemote(workTree, 'nope', true);
      expect(r.success).toBe(false);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

describe('fetchAllRemotes', () => {
  it('A.6.4 fetches all remotes', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      git(workTree, ['remote', 'add', 'origin', repo.remote]);
      const r = await fetchAllRemotes(workTree, true);
      expect(r.success).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

describe('pullRemote', () => {
  it('A.6.5 fast-forward pull', async () => {
    // Clone the fixture's remote so we have a full history
    const cloneName = 'opengit-pull-' + Date.now();
    const r = await import('../../electron/main/git/lifecycle').then(m =>
      m.cloneRepository({ url: repo.remote, destinationParent: require('node:os').tmpdir(), repoName: cloneName, recursiveSubmodules: false })
    );
    expect(r.success).toBe(true);
    try {
      // Pull should be ff since there's nothing new
      const pullR = await pullRemote(r.data!.path, 'origin', undefined, false, 'ff-only');
      expect(pullR.success).toBe(true);
    } finally {
      require('node:fs').rmSync(r.data!.path, { recursive: true, force: true });
    }
  });

  it('A.6.8 ff-only fails on diverged history', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      git(workTree, ['remote', 'add', 'origin', repo.remote]);
      await fetchRemote(workTree, 'origin', true);

      // Make a local commit that diverges
      write(workTree, 'div.txt', 'diverged\n');
      git(workTree, ['add', '.']);
      git(workTree, ['commit', '-q', '-m', 'local diverged']);

      const r = await pullRemote(workTree, 'origin', undefined, true);
      expect(r.success).toBe(false);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

describe('pushRemote', () => {
  it('A.6.9 pushes a new branch', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      git(workTree, ['remote', 'add', 'origin', repo.remote]);
      // Create a temp bare remote for push testing
      const bare = require('node:path').join(require('node:os').tmpdir(), 'opengit-push-' + Date.now());
      git(workTree, ['init', '--bare', '-b', 'main', bare]);
      git(workTree, ['remote', 'remove', 'origin']);
      git(workTree, ['remote', 'add', 'origin', bare]);

      const r = await pushRemote(workTree, 'origin', 'main', false, false);
      expect(r.success).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.6.10 push with setUpstream sets tracking', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      const bare = require('node:path').join(require('node:os').tmpdir(), 'opengit-up-' + Date.now());
      git(workTree, ['init', '--bare', '-b', 'main', bare]);
      git(workTree, ['remote', 'add', 'origin', bare]);

      const r = await pushRemote(workTree, 'origin', 'main', false, true);
      expect(r.success).toBe(true);
      const upstream = git(workTree, ['config', 'branch.main.remote']).trim();
      expect(upstream).toBe('origin');
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.6.11 push is rejected when behind remote', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      const bare = require('node:path').join(require('node:os').tmpdir(), 'opengit-rej-' + Date.now());
      git(workTree, ['init', '--bare', '-b', 'main', bare]);
      git(workTree, ['remote', 'add', 'origin', bare]);
      git(workTree, ['push', '-q', '-u', 'origin', 'main']);

      // Clone to a second worktree, make a commit there, push
      const cloneDir = require('node:path').join(require('node:os').tmpdir(), 'opengit-cl2-' + Date.now());
      git(workTree, ['clone', '-q', bare, cloneDir]);
      write(cloneDir, 'other.txt', 'other\n');
      git(cloneDir, ['add', '.']);
      git(cloneDir, ['commit', '-q', '-m', 'other commit']);
      git(cloneDir, ['push', '-q', 'origin', 'main']);

      // Now try to push from original (should be rejected)
      write(workTree, 'rej.txt', 'rejected\n');
      git(workTree, ['add', '.']);
      git(workTree, ['commit', '-q', '-m', 'local commit']);

      const r = await pushRemote(workTree, 'origin', undefined, false, false);
      expect(r.success).toBe(false);
      expect(r.data?.rejected).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.6.12 force-with-lease succeeds after rejection', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      const bare = require('node:path').join(require('node:os').tmpdir(), 'opengit-fl-' + Date.now());
      git(workTree, ['init', '--bare', '-b', 'main', bare]);
      git(workTree, ['remote', 'add', 'origin', bare]);
      git(workTree, ['push', '-q', '-u', 'origin', 'main']);

      const cloneDir = require('node:path').join(require('node:os').tmpdir(), 'opengit-cl3-' + Date.now());
      git(workTree, ['clone', '-q', bare, cloneDir]);
      write(cloneDir, 'other.txt', 'other\n');
      git(cloneDir, ['add', '.']);
      git(cloneDir, ['commit', '-q', '-m', 'other']);
      git(cloneDir, ['push', '-q', 'origin', 'main']);

      write(workTree, 'local.txt', 'local\n');
      git(workTree, ['add', '.']);
      git(workTree, ['commit', '-q', '-m', 'local']);

      // Fetch to update tracking ref so --force-with-lease can verify
      await fetchRemote(workTree, 'origin', false);
      // Force push should succeed
      const r = await pushRemote(workTree, 'origin', 'main', true, false);
      expect(r.success).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

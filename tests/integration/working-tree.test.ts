// tests/integration/working-tree.test.ts — A.3 Working tree / staging / hunk tests.
// Uses lightweight inline repos for controlled state + full fixture for status reads.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createQuickRepo, destroyQuickRepo, git, readFile, exists, type QuickRepo,
} from './helpers';

/** Write content to a file in the worktree (cross-platform, no shell needed). */
function write(workTree: string, rel: string, content: string): void {
  writeFileSync(join(workTree, rel), content);
}

/** Append content to a file in the worktree (cross-platform, no shell needed). */
function append(workTree: string, rel: string, content: string): void {
  appendFileSync(join(workTree, rel), content);
}

import {
  stagePaths, stageAll, unstagePaths, unstageAll,
  discardPaths, discardUntracked, discardAllUnstaged,
  stageHunks, unstageHunks,
} from '../../electron/main/git/operations';
import { getStatus } from '../../electron/main/git/repo';

// ─────────────────────────────────────────────────────────────────────────────
// Stage / Unstage
// ─────────────────────────────────────────────────────────────────────────────

describe('stage / unstage', () => {
  it('A.3.1 stages a modified file', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree, gitDir } = qr;
      const filePath = 'base.txt';
      write(workTree, 'base.txt', 'base\nmodified\n');

      const statusBefore = await getStatus(workTree, gitDir);
      expect(statusBefore.entries.some(e => e.path === filePath && !e.staged && e.unstaged)).toBe(true);

      const r = await stagePaths(workTree, [filePath]);
      expect(r.success).toBe(true);

      const statusAfter = await getStatus(workTree, gitDir);
      const e = statusAfter.entries.find(e => e.path === filePath);
      expect(e?.staged).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.3.3 unstages a staged file', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree, gitDir } = qr;
      write(workTree, 'base.txt', 'base\nmodified\n');
      await stagePaths(workTree, ['base.txt']);
      const r = await unstagePaths(workTree, ['base.txt']);
      expect(r.success).toBe(true);

      const status = await getStatus(workTree, gitDir);
      const e = status.entries.find(e => e.path === 'base.txt');
      if (e) {
        expect(e.staged).toBe(false);
        expect(e.unstaged).toBe(true);
      }
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.3.10 returns failure for nonexistent path', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      const r = await stagePaths(workTree, ['nope.txt']);
      expect(r.success).toBe(false);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

describe('stageAll / unstageAll', () => {
  it('A.3.2 stages all modified files at once', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree, gitDir } = qr;
      // Create multiple modifications
      write(workTree, 'a.txt', 'a\n');
      write(workTree, 'b.txt', 'b\n');
      git(workTree, ['add', '.']);
      git(workTree, ['commit', '-q', '-m', 'add a and b']);
      append(workTree, 'a.txt', 'a2\n');
      append(workTree, 'b.txt', 'b2\n');

      const r = await stageAll(workTree);
      expect(r.success).toBe(true);

      const status = await getStatus(workTree, gitDir);
      expect(status.entries.every(e => e.staged)).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.3.4 unstages all staged files', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree, gitDir } = qr;
      write(workTree, 'a.txt', 'a\n');
      await stagePaths(workTree, ['a.txt']);

      const r = await unstageAll(workTree);
      expect(r.success).toBe(true);

      const status = await getStatus(workTree, gitDir);
      expect(status.entries.every(e => !e.staged)).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Discard
// ─────────────────────────────────────────────────────────────────────────────

describe('discard', () => {
  it('A.3.5 discards tracked file changes', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      write(workTree, 'base.txt', 'modified content\n');

      const r = await discardPaths(workTree, ['base.txt']);
      expect(r.success).toBe(true);
      expect(readFile(workTree, 'base.txt')).toContain('base'); // restored from HEAD
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.3.6 removes untracked files', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      write(workTree, 'temp.txt', 'temp\n');
      expect(exists(workTree, 'temp.txt')).toBe(true);

      const r = await discardUntracked(workTree, ['temp.txt']);
      expect(r.success).toBe(true);
      expect(exists(workTree, 'temp.txt')).toBe(false);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('discards every unstaged change while preserving the staged snapshot', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree, gitDir } = qr;
      write(workTree, 'base.txt', 'base\nstaged\n');
      await stagePaths(workTree, ['base.txt']);
      write(workTree, 'base.txt', 'base\nstaged\nunstaged\n');
      write(workTree, 'untracked.txt', 'delete me\n');

      const result = await discardAllUnstaged(workTree, gitDir);

      expect(result.success).toBe(true);
      expect(readFile(workTree, 'base.txt')).toBe('base\nstaged\n');
      expect(exists(workTree, 'untracked.txt')).toBe(false);
      expect(git(workTree, ['diff', '--cached', '--', 'base.txt'])).toContain('+staged');
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Hunk staging
// ─────────────────────────────────────────────────────────────────────────────

describe('hunk staging', () => {
  it('A.3.7 stages a hunk via apply-patch', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      // Create a file with multiple lines
      write(workTree, 'multi.txt', 'line1\nline2\nline3\n');
      await stagePaths(workTree, ['multi.txt']);
      git(workTree, ['commit', '-q', '-m', 'add multi.txt']);

      // Modify line2 only (the hunk we want to stage)
      write(workTree, 'multi.txt', 'line1\nline2-modified\nline3\n');

      // Create a unified diff patch that only changes line2
      const patch = '@@ -1,3 +1,3 @@\n line1\n-line2\n+line2-modified\n line3\n';

      const r = await stageHunks(workTree, 'multi.txt', `diff --git a/multi.txt b/multi.txt\nindex 111..222 100644\n--- a/multi.txt\n+++ b/multi.txt\n${patch}`);
      expect(r.success).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.3.9 unstages a hunk via reverse-apply', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      write(workTree, 'multi.txt', 'a\nb\nc\n');
      await stagePaths(workTree, ['multi.txt']);
      git(workTree, ['commit', '-q', '-m', 'add multi']);
      write(workTree, 'multi.txt', 'a\nb-modified\nc\n');
      await stagePaths(workTree, ['multi.txt']);

      // Patch describing the change from HEAD to staged (unstageHunks will reverse-apply)
      const patch = '@@ -1,3 +1,3 @@\n a\n-b\n+b-modified\n c\n';
      const r = await unstageHunks(workTree, 'multi.txt', `diff --git a/multi.txt b/multi.txt\n--- a/multi.txt\n+++ b/multi.txt\n${patch}`);
      expect(r.success).toBe(true); // reverse-apply should succeed
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

// tests/integration/working-tree.test.ts — A.3 Working tree / staging / hunk tests.
// Uses lightweight inline repos for controlled state + full fixture for status reads.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import {
  createQuickRepo, destroyQuickRepo, git, readFile, exists, type QuickRepo,
} from './helpers';

function bash(workTree: string, cmd: string) {
  execSync(cmd, { cwd: workTree, shell: true, stdio: 'pipe' });
}
import {
  stagePaths, stageAll, unstagePaths, unstageAll,
  discardPaths, discardUntracked,
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
      bash(workTree, 'printf "base\nmodified\n" > base.txt');

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
      bash(workTree, 'printf "base\nmodified\n" > base.txt');
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
      bash(workTree, 'printf "a\n" > a.txt && printf "b\n" > b.txt');
      git(workTree, ['add', '.']);
      git(workTree, ['commit', '-q', '-m', 'add a and b']);
      bash(workTree, 'printf "a2\n" >> a.txt && printf "b2\n" >> b.txt');

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
      bash(workTree, 'printf "a\n" > a.txt');
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
      bash(workTree, 'printf "modified content\n" > base.txt');

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
      bash(workTree, 'printf "temp\n" > temp.txt');
      expect(exists(workTree, 'temp.txt')).toBe(true);

      const r = await discardUntracked(workTree, ['temp.txt']);
      expect(r.success).toBe(true);
      expect(exists(workTree, 'temp.txt')).toBe(false);
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
      bash(workTree, 'printf "line1\nline2\nline3\n" > multi.txt');
      await stagePaths(workTree, ['multi.txt']);
      git(workTree, ['commit', '-q', '-m', 'add multi.txt']);

      // Modify line2 only (the hunk we want to stage)
      bash(workTree, 'printf "line1\nline2-modified\nline3\n" > multi.txt');

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
      bash(workTree, 'printf "a\nb\nc\n" > multi.txt');
      await stagePaths(workTree, ['multi.txt']);
      git(workTree, ['commit', '-q', '-m', 'add multi']);
      bash(workTree, 'printf "a\nb-modified\nc\n" > multi.txt');
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

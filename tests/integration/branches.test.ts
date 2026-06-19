// tests/integration/branches.test.ts — A.5 Branch operations tests.
// Uses lightweight inline repos.

import { describe, it, expect } from 'vitest';
import {
  createQuickRepo, destroyQuickRepo, git, branchExists, currentBranch,
} from './helpers';
import {
  checkoutBranch, createBranch, deleteBranch, renameBranch, setUpstream,
} from '../../electron/main/git/operations';

describe('branches', () => {
  it('A.5.1 checks out an existing branch', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      git(workTree, ['checkout', '-q', '-b', 'dev']);
      git(workTree, ['checkout', '-q', 'main']);

      const r = await checkoutBranch(workTree, 'dev');
      expect(r.success).toBe(true);
      expect(currentBranch(workTree)).toBe('dev');
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.5.2 checks out with -b (create)', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      const r = await checkoutBranch(workTree, 'new-branch', true);
      expect(r.success).toBe(true);
      expect(currentBranch(workTree)).toBe('new-branch');
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.5.4 returns error for nonexistent ref', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      const r = await checkoutBranch(workTree, 'nope');
      expect(r.success).toBe(false);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.5.5 creates a branch without checkout', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      const r = await createBranch(workTree, 'feature-x', 'HEAD', false);
      expect(r.success).toBe(true);
      expect(branchExists(workTree, 'feature-x')).toBe(true);
      expect(currentBranch(workTree)).toBe('main');
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.5.6 creates and checks out a branch', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      const r = await createBranch(workTree, 'dev', 'HEAD', true);
      expect(r.success).toBe(true);
      expect(currentBranch(workTree)).toBe('dev');
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.5.7 deletes a non-current branch', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      await createBranch(workTree, 'to-delete', 'HEAD', false);
      const r = await deleteBranch(workTree, 'to-delete', false);
      expect(r.success).toBe(true);
      expect(branchExists(workTree, 'to-delete')).toBe(false);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.5.8 fails to delete current branch', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      const r = await deleteBranch(workTree, 'main', false);
      expect(r.success).toBe(false);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.5.10 renames a branch', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      await createBranch(workTree, 'old-name', 'HEAD', false);
      const r = await renameBranch(workTree, 'old-name', 'new-name');
      expect(r.success).toBe(true);
      expect(branchExists(workTree, 'new-name')).toBe(true);
      expect(branchExists(workTree, 'old-name')).toBe(false);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.5.11 sets upstream for a branch', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      // Create a remote
      const remotePath = join(require('node:os').tmpdir(), 'opengit-remote-' + Date.now());
      git(workTree, ['init', '--bare', remotePath]);
      git(workTree, ['remote', 'add', 'origin', remotePath]);
      git(workTree, ['push', '-q', '-u', 'origin', 'main']);

      await checkoutBranch(workTree, 'main');
      const r = await setUpstream(workTree, 'main', 'origin/main');
      expect(r.success).toBe(true);

      const upstream = git(workTree, ['config', 'branch.main.merge']).trim();
      expect(upstream).toBe('refs/heads/main');
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

import { join } from 'node:path';

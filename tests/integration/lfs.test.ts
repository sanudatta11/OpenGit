// tests/integration/lfs.test.ts — A.12 LFS operations.
// Skips if git-lfs binary is not available.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { listLFSTracked, lfsTrack } from '../../electron/main/git/operations';
import { createQuickRepo, destroyQuickRepo, lfsAvailable } from './helpers';

const itIfLfs = lfsAvailable() ? it : it.skip;

describe('LFS', () => {
  itIfLfs('A.12.1 lists tracked patterns from fixture repo', async () => {
    // Create a repo with .gitattributes already set up
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      // Simulate LFS tracking by writing .gitattributes directly
      writeFileSync(join(workTree, '.gitattributes'),
        '*.png filter=lfs diff=lfs merge=lfs -text\n*.jpg filter=lfs diff=lfs merge=lfs -text\n');
      execFileSync('git', ['add', '.gitattributes'], { cwd: workTree, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      execFileSync('git', ['commit', '-q', '-m', 'lfs attr'], { cwd: workTree, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });

      const patterns = await listLFSTracked(workTree);
      expect(patterns.length).toBeGreaterThanOrEqual(2);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  itIfLfs('A.12.2 tracks a new pattern', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      const r = await lfsTrack(workTree, '*.zip');
      expect(r.success).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  itIfLfs('A.12.4 returns empty when LFS is not configured', async () => {
    const qr = createQuickRepo();
    try {
      const patterns = await listLFSTracked(qr.workTree);
      expect(patterns.length).toBe(0);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

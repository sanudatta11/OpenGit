// tests/integration/concurrency.test.ts — C.1–C.5 Concurrency & cancellation tests.
// Uses lightweight inline repos.

import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBranch } from '../../electron/main/git/operations';

describe('concurrency', () => {
  it('C.4 concurrent writes to different refs', async () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'opengit-cc-'));
    try {
      execSync('git init -q -b main', { cwd: repoDir });
      execSync('git config user.email t@t.co', { cwd: repoDir });
      execSync('git config user.name Test', { cwd: repoDir });
      execSync('git config commit.gpgsign false', { cwd: repoDir });
      writeFileSync(join(repoDir, 'base.txt'), 'base\n');
      execSync('git add . && git commit -q -m base', { cwd: repoDir });

      const [r1, r2] = await Promise.all([
        createBranch(repoDir, 'branch-a', 'HEAD', false),
        createBranch(repoDir, 'branch-b', 'HEAD', false),
      ]);
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);

      const branches = execSync('git branch', { cwd: repoDir, encoding: 'utf8' });
      expect(branches).toContain('branch-a');
      expect(branches).toContain('branch-b');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

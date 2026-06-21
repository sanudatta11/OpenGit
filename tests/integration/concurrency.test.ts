// tests/integration/concurrency.test.ts — C.1–C.5 Concurrency & cancellation tests.
// Uses lightweight inline repos.

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBranch } from '../../electron/main/git/operations';

const GIT_ENV = { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false' } satisfies Record<string, string | undefined>;

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], env: GIT_ENV,
  });
}

describe('concurrency', () => {
  it('C.4 concurrent writes to different refs', async () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'opengit-cc-'));
    try {
      git(repoDir, ['init', '-q', '-b', 'main']);
      git(repoDir, ['config', 'user.email', 't@t.co']);
      git(repoDir, ['config', 'user.name', 'Test']);
      git(repoDir, ['config', 'commit.gpgsign', 'false']);
      writeFileSync(join(repoDir, 'base.txt'), 'base\n');
      git(repoDir, ['add', '.']);
      git(repoDir, ['commit', '-q', '-m', 'base']);

      const [r1, r2] = await Promise.all([
        createBranch(repoDir, 'branch-a', 'HEAD', false),
        createBranch(repoDir, 'branch-b', 'HEAD', false),
      ]);
      expect(r1.success).toBe(true);
      expect(r2.success).toBe(true);

      const branches = git(repoDir, ['branch']);
      expect(branches).toContain('branch-a');
      expect(branches).toContain('branch-b');
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

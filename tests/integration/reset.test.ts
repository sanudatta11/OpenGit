// tests/integration/reset.test.ts — A.17 Reset operations (table-driven).
// Uses lightweight inline repos with beforeEach isolation.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetBranch } from '../../electron/main/git/operations';

let repoDir: string;

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false' },
  });
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-reset-'));
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(repoDir, { recursive: true, force: true });
  mkdirSync(repoDir, { recursive: true });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 't@t.co']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(repoDir, 'base.txt'), 'base\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'init']);
  // Add a second commit with content we can check
  writeFileSync(join(repoDir, 'second.txt'), 'second\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'second commit']);
  // Modify second.txt in the working tree
  writeFileSync(join(repoDir, 'second.txt'), 'second modified\n');
  // Stage the modification
  git(['add', '.']);
});

describe.each([
  ['soft',  true,   'staged - working tree unchanged'],
  ['mixed', true,   'unstaged - changes present but not staged'],
  ['hard',  false,  'discarded - working tree matches HEAD~1'],
  ['keep',  false,  'kept - uncommitted tracked changes preserved'],
] as const)('reset %s', (mode, _expectStaged, description) => {
  it(`A.17.{index} leaves working tree ${description}`, async () => {
    if (mode === 'keep') {
      // --keep requires changes to be only in working tree, not staged,
      // and the changed file must exist in both HEAD and HEAD~1 (base.txt).
      git(['reset', '-q', 'HEAD', 'second.txt']); // unstage second.txt
      git(['checkout', '-q', '--', 'second.txt']); // revert working tree
      require('fs').writeFileSync(join(repoDir, 'base.txt'), 'base modified\n'); // unstaged change to base.txt
    }
    const r = await resetBranch(repoDir, 'HEAD~1', mode);
    expect(r.success).toBe(true);

    const log = git(['log', '--oneline', '-1']);
    // After reset HEAD~1, the subject should be 'init'
    expect(log).toContain('init');

    const status = git(['status', '--porcelain']);
    const fileExists = require('fs').existsSync(join(repoDir, 'second.txt'));

    if (mode === 'soft') {
      // Changes remain staged (as Added since second.txt wasn't in HEAD~1)
      expect(status).toContain('A  second.txt');
      expect(fileExists).toBe(true);
    } else if (mode === 'mixed') {
      // Changes remain in working tree (untracked, since HEAD~1 has no second.txt)
      expect(status).toContain('?? second.txt');
      expect(fileExists).toBe(true);
    } else if (mode === 'hard') {
      // Changes discarded
      expect(status.trim()).toBe('');
      expect(fileExists).toBe(false);
    } else if (mode === 'keep') {
      // --keep preserves working tree changes to base.txt as unstaged
      expect(status).toContain(' M base.txt');
      expect(fileExists).toBe(false); // second.txt removed by reset
    }
  });
});

describe('reset edge cases', () => {
  it('A.17.5 returns failure for nonexistent ref', async () => {
    const r = await resetBranch(repoDir, 'nope', 'soft');
    expect(r.success).toBe(false);
  });
});

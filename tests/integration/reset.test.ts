// tests/integration/reset.test.ts — A.17 Reset operations (table-driven).
// Uses lightweight inline repos with beforeEach isolation.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resetBranch } from '../../electron/main/git/operations';

let repoDir: string;

function git(args: string[]): string {
  return execSync(`git ${args.map(a => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C' },
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
    const r = await resetBranch(repoDir, 'HEAD~1', mode);
    expect(r.success).toBe(true);

    const log = git(['log', '--oneline', '-1']);
    // After reset HEAD~1, the subject should be 'init'
    expect(log).toContain('init');

    const status = git(['status', '--porcelain']);
    const fileExists = require('fs').existsSync(join(repoDir, 'second.txt'));

    if (mode === 'soft') {
      // Changes remain staged
      expect(status).toContain('M  second.txt');
      expect(fileExists).toBe(true);
    } else if (mode === 'mixed') {
      // Changes remain unstaged
      expect(status).toContain(' M second.txt');
      expect(fileExists).toBe(true);
    } else if (mode === 'hard') {
      // Changes discarded
      expect(status.trim()).toBe('');
      expect(fileExists).toBe(false);
    } else if (mode === 'keep') {
      // Changes preserved (unstaged)
      expect(status).toContain(' M second.txt');
      expect(fileExists).toBe(true);
    }
  });
});

describe('reset edge cases', () => {
  it('A.17.5 returns failure for nonexistent ref', async () => {
    const r = await resetBranch(repoDir, 'nope', 'soft');
    expect(r.success).toBe(false);
  });
});

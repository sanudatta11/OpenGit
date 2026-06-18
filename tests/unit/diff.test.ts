// tests/unit/diff.test.ts — validate diff parser against a real git fixture repo.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseNumstat, parseUnifiedDiff } from '../../electron/main/git/parse/diff';

let repoDir: string;

function git(args: string[]): string {
  return execSync(`git ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    cwd: repoDir,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C' },
  });
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-diff-'));
  git(['init', '-q']);
  git(['config', 'user.email', 't@t.co']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);

  // Initial: a.txt with 3 lines
  writeFileSync(join(repoDir, 'a.txt'), 'line1\nline2\nline3\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'initial']);

  // Modify: change line 2, add line 4
  writeFileSync(join(repoDir, 'a.txt'), 'line1\nline2 modified\nline3\nline4 added\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'modify a.txt']);

  // Add a new file
  writeFileSync(join(repoDir, 'b.txt'), 'b content\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'add b.txt']);

  // Delete a.txt
  execSync('git rm a.txt', { cwd: repoDir, encoding: 'utf8' });
  git(['commit', '-q', '-m', 'delete a.txt']);

  // Rename b.txt -> c.txt
  git(['mv', 'b.txt', 'c.txt']);
  git(['commit', '-q', '-m', 'rename b to c']);

  // Add a binary file
  mkdirSync(join(repoDir, 'bin'));
  writeFileSync(join(repoDir, 'bin', 'data.bin'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a]));
  git(['add', '.']);
  git(['commit', '-q', '-m', 'add binary']);
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe('parseNumstat', () => {
  it('parses additions/deletions per file', () => {
    const headSha = git(['rev-parse', 'HEAD~4']).trim(); // commit that modified a.txt
    const raw = git(['diff-tree', '--no-commit-id', '--numstat', '--root', '-M', headSha]);
    const files = parseNumstat(raw);
    const a = files.find((f) => f.path === 'a.txt');
    expect(a).toBeDefined();
    expect(a!.additions).toBeGreaterThan(0);
    expect(a!.deletions).toBeGreaterThan(0);
  });

  it('detects binary files via - marker', () => {
    const headSha = git(['rev-parse', 'HEAD']).trim(); // commit that added binary
    const raw = git(['diff-tree', '--no-commit-id', '--numstat', '--root', '-M', headSha]);
    const files = parseNumstat(raw);
    const bin = files.find((f) => f.path.includes('data.bin'));
    expect(bin).toBeDefined();
    expect(bin!.isBinary).toBe(true);
  });
});

describe('parseUnifiedDiff', () => {
  it('parses hunk headers and line types', () => {
    const headSha = git(['rev-parse', 'HEAD~4']).trim();
    const raw = git(['diff-tree', '-p', '--no-color', '-M', headSha]);
    const diff = parseUnifiedDiff(raw, 'a.txt');

    expect(diff.path).toBe('a.txt');
    expect(diff.isBinary).toBe(false);
    expect(diff.hunks.length).toBeGreaterThan(0);

    const firstHunk = diff.hunks[0]!;
    expect(firstHunk.header).toMatch(/^@@ -\d+,\d+ \+\d+,\d+ @@/);
    expect(firstHunk.lines.length).toBeGreaterThan(0);

    const hasAdd = firstHunk.lines.some((l) => l.type === 'add');
    const hasDel = firstHunk.lines.some((l) => l.type === 'del');
    expect(hasAdd).toBe(true);
    expect(hasDel).toBe(true);

    // Line numbers should be set on context lines
    const ctx = firstHunk.lines.find((l) => l.type === 'context');
    expect(ctx).toBeDefined();
    expect(ctx!.oldLineNo).toBeGreaterThan(0);
    expect(ctx!.newLineNo).toBeGreaterThan(0);
  });

  it('counts additions and deletions', () => {
    const headSha = git(['rev-parse', 'HEAD~4']).trim();
    const raw = git(['diff-tree', '-p', '--no-color', '-M', headSha]);
    const diff = parseUnifiedDiff(raw, 'a.txt');
    expect(diff.additions).toBeGreaterThan(0);
    expect(diff.deletions).toBeGreaterThan(0);
  });

  it('detects binary files from header', () => {
    const headSha = git(['rev-parse', 'HEAD']).trim();
    const raw = git(['diff-tree', '-p', '--no-color', '-M', headSha]);
    const diff = parseUnifiedDiff(raw, 'bin/data.bin');
    expect(diff.isBinary).toBe(true);
    expect(diff.hunks.length).toBe(0);
  });

  it('detects renames', () => {
    const headSha = git(['rev-parse', 'HEAD~1']).trim(); // rename commit
    const raw = git(['diff-tree', '-p', '--no-color', '-M', headSha]);
    const diff = parseUnifiedDiff(raw, 'c.txt');
    expect(diff.isRename).toBe(true);
    expect(diff.oldPath).toBe('b.txt');
  });

  it('handles added files (no original)', () => {
    const headSha = git(['rev-parse', 'HEAD~3']).trim(); // add b.txt commit
    const raw = git(['diff-tree', '-p', '--no-color', '-M', headSha]);
    const diff = parseUnifiedDiff(raw, 'b.txt');
    expect(diff.hunks.length).toBeGreaterThan(0);
    // All lines should be additions
    const allAdd = diff.hunks[0]!.lines.every((l) => l.type === 'add' || l.type === 'no-newline');
    expect(allAdd).toBe(true);
    expect(diff.additions).toBeGreaterThan(0);
    expect(diff.deletions).toBe(0);
  });
});

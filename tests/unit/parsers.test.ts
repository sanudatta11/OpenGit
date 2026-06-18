// tests/unit/parsers.test.ts — validate parsers against a real git fixture repo.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseStatus } from '../../electron/main/git/parse/status';
import { parseLog, LOG_FORMAT } from '../../electron/main/git/parse/log';
import { parseBranches } from '../../electron/main/git/parse/branches';
import { parseRemotes } from '../../electron/main/git/parse/remotes';
import { parseInProgressState } from '../../electron/main/git/parse/state';

let repoDir: string;
let gitDir: string;

function git(args: string[], opts: { input?: string } = {}): string {
  const r = execSync(`git ${args.map((a) => `'${a.replace(/'/g, "'\\''")}'`).join(' ')}`, {
    cwd: repoDir,
    encoding: 'utf8',
    input: opts.input,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C' },
  });
  return r;
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-test-'));
  git(['init', '-q']);
  git(['config', 'user.email', 't@t.co']);
  git(['config', 'user.name', 'Test']);
  git(['config', 'commit.gpgsign', 'false']);

  // Commit 1: a.txt
  writeFileSync(join(repoDir, 'a.txt'), 'a\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'first commit']);

  // Commit 2: b.txt
  writeFileSync(join(repoDir, 'b.txt'), 'b\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'second commit']);

  // Branch feature + commit
  git(['checkout', '-q', '-b', 'feature']);
  writeFileSync(join(repoDir, 'c.txt'), 'c\n');
  git(['add', '.']);
  git(['commit', '-q', '-m', 'feature commit']);

  // Merge into main (no-ff)
  git(['checkout', '-q', 'main']);
  git(['merge', '-q', '--no-ff', 'feature', '-m', 'merge feature']);

  // Make worktree dirty
  writeFileSync(join(repoDir, 'a.txt'), 'a\nmodified\n');
  writeFileSync(join(repoDir, 'untracked.txt'), 'untracked\n');

  gitDir = join(repoDir, '.git');
});

afterAll(() => {
  rmSync(repoDir, { recursive: true, force: true });
});

describe('parseStatus', () => {
  it('parses branch + dirty entries', () => {
    const raw = git(['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']);
    const status = parseStatus(raw, gitDir, repoDir);

    expect(status.branch).toBe('main');
    expect(status.upstream).toBeNull(); // no upstream configured
    expect(status.ahead).toBe(0);
    expect(status.behind).toBe(0);
    expect(status.isClean).toBe(false);

    const paths = status.entries.map((e) => e.path).sort();
    expect(paths).toEqual(['a.txt', 'untracked.txt']);

    const a = status.entries.find((e) => e.path === 'a.txt')!;
    expect(a.kind).toBe('modified');
    expect(a.staged).toBe(false);
    expect(a.unstaged).toBe(true);

    const u = status.entries.find((e) => e.path === 'untracked.txt')!;
    expect(u.kind).toBe('untracked');
    expect(u.staged).toBe(false);
    expect(u.unstaged).toBe(false); // untracked is not "unstaged" by our definition
  });

  it('detects when worktree is clean', () => {
    // Stash everything to make a clean state.
    git(['stash', '-q', '--include-untracked']);
    try {
      const raw = git(['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all']);
      const status = parseStatus(raw, gitDir, repoDir);
      expect(status.isClean).toBe(true);
      expect(status.entries).toHaveLength(0);
    } finally {
      git(['stash', 'pop', '-q']);
    }
  });
});

describe('parseLog', () => {
  it('parses commits with parents', () => {
    const raw = git(['log', `--pretty=format:${LOG_FORMAT}`, '-z', '--max-count=10']);
    const { commits, hasMore } = parseLog(raw);

    expect(commits.length).toBe(4); // merge + 2 on main + 1 on feature
    expect(hasMore).toBe(false);

    const merge = commits[0]!;
    expect(merge.subject).toBe('merge feature');
    expect(merge.parents.length).toBe(2); // merge commit

    const first = commits[commits.length - 1]!;
    expect(first.parents).toEqual([]); // root
    expect(first.subject).toBe('first commit');
  });

  it('captures author + committer info', () => {
    const raw = git(['log', `--pretty=format:${LOG_FORMAT}`, '-z', '--max-count=1']);
    const { commits } = parseLog(raw);
    const c = commits[0]!;
    expect(c.author.name).toBe('Test');
    expect(c.author.email).toBe('t@t.co');
    expect(c.author.date).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });
});

describe('parseBranches', () => {
  it('parses local branches with HEAD detection', () => {
    const fmt = [
      '%(refname)', '%(objectname)', '%(upstream)', '%(upstream:track)', '%(HEAD)', '%(authordate:iso-strict)',
    ].join('\x1f');
    const raw = git(['for-each-ref', `--format=${fmt}`, 'refs/heads/', 'refs/remotes/', 'refs/tags/']);
    const headRef = `ref: refs/heads/main`;
    const { branches, refsBySha, currentHeadSha } = parseBranches(raw, headRef, null);

    const names = branches.map((b) => b.shortName).sort();
    expect(names).toEqual(['feature', 'main']);

    const main = branches.find((b) => b.shortName === 'main')!;
    expect(main.kind).toBe('local');
    expect(main.isHead).toBe(true);
    expect(main.upstream).toBeNull();
    expect(currentHeadSha).toBe(main.sha);

    // refsBySha should map main's sha to a label including HEAD
    const labels = refsBySha.get(main.sha) ?? [];
    expect(labels.some((l) => l.isHead)).toBe(true);
  });
});

describe('parseRemotes', () => {
  it('handles repos with no remotes', () => {
    const raw = git(['remote', '-v']);
    const remotes = parseRemotes(raw);
    expect(remotes).toEqual([]);
  });

  it('parses remotes when configured', () => {
    git(['remote', 'add', 'origin', 'git@github.com:foo/bar.git']);
    try {
      const raw = git(['remote', '-v']);
      const remotes = parseRemotes(raw);
      expect(remotes).toHaveLength(1);
      expect(remotes[0]!.name).toBe('origin');
      expect(remotes[0]!.fetchUrl).toBe('git@github.com:foo/bar.git');
      expect(remotes[0]!.pushUrl).toBe('git@github.com:foo/bar.git');
    } finally {
      git(['remote', 'remove', 'origin']);
    }
  });
});

describe('parseInProgressState', () => {
  it('detects clean state when no ops in progress', () => {
    const states = parseInProgressState(gitDir, repoDir);
    expect(states).toHaveLength(0);
  });

  it('detects merge state', () => {
    // Create a conflict by merging something incompatible.
    git(['checkout', '-q', 'feature']);
    writeFileSync(join(repoDir, 'a.txt'), 'conflict\n');
    git(['commit', '-q', '-am', 'change on feature']);
    git(['checkout', '-q', 'main']);
    writeFileSync(join(repoDir, 'a.txt'), 'main change\n');
    git(['commit', '-q', '-am', 'change on main']);
    try {
      const mergeResult = execSync('git merge --no-ff feature 2>&1 || true', {
        cwd: repoDir, encoding: 'utf8',
      });
      // expect conflict
      expect(mergeResult.toLowerCase()).toContain('conflict');

      const states = parseInProgressState(gitDir, repoDir);
      const merge = states.find((s) => s.kind === 'merge');
      expect(merge).toBeDefined();
      expect(merge!.canAbort).toBe(true);
      expect(merge!.canContinue).toBe(true);
    } finally {
      execSync('git merge --abort', { cwd: repoDir, encoding: 'utf8' });
    }
  });
});

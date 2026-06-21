// tests/integration/rebase.test.ts — A.15 Rebase operations.
// Uses lightweight inline repos with beforeEach isolation.

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  rebaseBranch, rebaseInteractivePlan, applyRebaseInteractive,
  abortOperation,
} from '../../electron/main/git/operations';
import { parseInProgressState } from '../../electron/main/git/parse/state';

let repoDir: string;

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false' },
  });
}

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), 'opengit-rebase-'));
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
  git(['commit', '-q', '-m', 'base']);
});

const onto = 'main';

describe('rebase', () => {
  it('A.15.1 basic rebase succeeds', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'f.txt'), 'f\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'feature commit']);
    git(['checkout', '-q', 'main']);
    git(['checkout', '-q', 'feature']);

    const r = await rebaseBranch(repoDir, { onto });
    expect(r.success).toBe(true);
    expect(r.data?.conflicts).toEqual([]);
  });

  it('A.15.2 rebase conflict detection', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'base.txt'), 'feature\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'change on feature']);
    git(['checkout', '-q', 'main']);
    writeFileSync(join(repoDir, 'base.txt'), 'main\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'change on main']);

    git(['checkout', '-q', 'feature']);
    const r = await rebaseBranch(repoDir, { onto });
    expect(r.success).toBe(false);
    expect(r.data?.conflicts).toContain('base.txt');
  });

  it('A.15.3 abort rebase during conflict', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    writeFileSync(join(repoDir, 'base.txt'), 'feature\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'change on feature']);
    git(['checkout', '-q', 'main']);
    writeFileSync(join(repoDir, 'base.txt'), 'main\n');
    git(['add', '.']);
    git(['commit', '-q', '-m', 'change on main']);

    git(['checkout', '-q', 'feature']);
    await rebaseBranch(repoDir, { onto });

    const r = await abortOperation(repoDir, 'rebase');
    expect(r.success).toBe(true);

    const states = parseInProgressState(join(repoDir, '.git'), repoDir);
    expect(states.find(s => s.kind === 'rebase')).toBeUndefined();
  });

  it('A.15.6 interactive rebase plan', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    for (const msg of ['commit A', 'commit B', 'commit C']) {
      writeFileSync(join(repoDir, `${msg}.txt`), msg);
      git(['add', '.']);
      git(['commit', '-q', '-m', msg]);
    }

    const plan = await rebaseInteractivePlan(repoDir, onto);
    expect(plan.items.length).toBe(3);
    expect(plan.items[0]!.action).toBe('pick');
    expect(plan.items[2]!.action).toBe('pick');
  });

  it('A.15.8 apply interactive rebase (squash)', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    for (const msg of ['first', 'second', 'third']) {
      writeFileSync(join(repoDir, `${msg}.txt`), msg);
      git(['add', '.']);
      git(['commit', '-q', '-m', msg]);
    }

    const plan = await rebaseInteractivePlan(repoDir, onto);
    expect(plan.items.length).toBe(3);

    // Create a mutable copy of the plan items for modification
    const items: { action: string; sha: string }[] = plan.items.map(i => ({ action: i.action, sha: i.sha }));
    items[1]!.action = 'squash';
    const r = await applyRebaseInteractive(repoDir, onto, items);
    expect(r.success).toBe(true);

    const log = git(['log', '--oneline']).trim().split('\n');
    expect(log.length).toBeGreaterThanOrEqual(2);
  });

  it('A.15.9 apply interactive rebase (drop)', async () => {
    git(['checkout', '-q', '-b', 'feature']);
    for (const msg of ['keep', 'drop-me', 'keep-too']) {
      writeFileSync(join(repoDir, `${msg}.txt`), msg);
      git(['add', '.']);
      git(['commit', '-q', '-m', msg]);
    }

    const plan = await rebaseInteractivePlan(repoDir, onto);
    expect(plan.items.length).toBe(3);

    const items: { action: string; sha: string }[] = plan.items.map(i => ({ action: i.action, sha: i.sha }));
    items[1]!.action = 'drop';
    const r = await applyRebaseInteractive(repoDir, onto, items);
    expect(r.success).toBe(true);

    const subjects = git(['log', '--pretty=format:%s']).trim().split('\n');
    expect(subjects).not.toContain('drop-me');
  });
});

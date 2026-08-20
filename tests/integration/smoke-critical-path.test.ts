import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { stageAll, stagePaths, unstagePaths } from '../../electron/main/git/operations/workingTree';
import { createCommit } from '../../electron/main/git/operations/commits';
import { createTag } from '../../electron/main/git/operations/refs';
import { getStatus } from '../../electron/main/git/repo';
import { subscribeLog } from '../../electron/main/log/emitter';
import type { LogEntry } from '@shared/git';

async function git(cwd: string, args: string[]) {
  return execa('git', args, { cwd });
}

async function initRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'opengit-smoke-'));
  await git(dir, ['init']);
  await git(dir, ['config', 'user.name', 'Test']);
  await git(dir, ['config', 'user.email', 'test@opengit.dev']);
  await git(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'README.md'), 'hello\n');
  await git(dir, ['add', '.']);
  await git(dir, ['commit', '-m', 'init']);
  return dir;
}

describe('critical-path smoke (stage → commit → tag)', () => {
  let repo = '';
  const entries: LogEntry[] = [];
  let unsubscribe: (() => void) | undefined;

  beforeEach(async () => {
    repo = await initRepo();
    entries.length = 0;
    unsubscribe = subscribeLog((entry) => entries.push(entry));
  });

  afterEach(() => {
    unsubscribe?.();
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it('stages, commits, and tags a change', async () => {
    writeFileSync(join(repo, 'feature.ts'), 'export const x = 1;\n');
    const staged = await stagePaths(repo, ['feature.ts']);
    expect(staged.success).toBe(true);

    const status = await getStatus(repo, join(repo, '.git'));
    expect(status.entries.some((e) => e.path === 'feature.ts' && e.staged)).toBe(true);

    const commit = await createCommit(repo, { message: 'feat: add feature', sign: false });
    expect(commit.success).toBe(true);
    expect(commit.data?.sha).toBeTruthy();

    const tag = await createTag(repo, { name: 'smoke-v1', start: commit.data!.sha });
    expect(tag.success).toBe(true);
    expect(existsSync(join(repo, '.git', 'refs', 'tags', 'smoke-v1'))).toBe(true);

    // Unstage path is a no-op after commit but must remain callable.
    const unstage = await unstagePaths(repo, ['feature.ts']);
    expect(unstage.success).toBe(true);

    // Log subscription receives at least one write-channel entry for this flow.
    expect(entries.some((e) => e.channel.includes('workingTree') || e.channel.includes('commit') || e.channel.includes('tag'))).toBe(true);
  });

  it('stageAll prepares a commit from dirty tree', async () => {
    writeFileSync(join(repo, 'a.txt'), 'a\n');
    writeFileSync(join(repo, 'b.txt'), 'b\n');
    const result = await stageAll(repo);
    expect(result.success).toBe(true);
    const commit = await createCommit(repo, { message: 'chore: bulk', sign: false });
    expect(commit.success).toBe(true);
  });
});

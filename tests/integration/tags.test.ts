import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { createCommit } from '../../electron/main/git/operations/commits';
import { createTag, deleteTag } from '../../electron/main/git/operations/refs';
import { stageAll } from '../../electron/main/git/operations/workingTree';

async function git(cwd: string, args: string[]) {
  return execa('git', args, { cwd });
}

async function initRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'opengit-tags-'));
  await git(dir, ['init']);
  await git(dir, ['config', 'user.name', 'Test']);
  await git(dir, ['config', 'user.email', 'test@opengit.dev']);
  await git(dir, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(dir, 'README.md'), 'hello\n');
  await git(dir, ['add', '.']);
  await git(dir, ['commit', '-m', 'init']);
  return dir;
}

describe('tag operations', () => {
  let repo = '';

  beforeEach(async () => {
    repo = await initRepo();
  });

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it('creates and deletes a lightweight tag', async () => {
    const created = await createTag(repo, { name: 'v0.1.0' });
    expect(created.success).toBe(true);
    expect(created.changedRefs).toContain('refs/tags/v0.1.0');

    const listed = await git(repo, ['tag', '-l']);
    expect(listed.stdout.trim().split('\n')).toContain('v0.1.0');

    const deleted = await deleteTag(repo, 'v0.1.0');
    expect(deleted.success).toBe(true);
    const after = await git(repo, ['tag', '-l']);
    expect(after.stdout.trim()).toBe('');
  });

  it('creates an annotated tag at a specific commit', async () => {
    writeFileSync(join(repo, 'README.md'), 'hello\nworld\n');
    await stageAll(repo);
    const commit = await createCommit(repo, { message: 'second' });
    expect(commit.success).toBe(true);

    const created = await createTag(repo, {
      name: 'release',
      start: commit.data!.sha,
      annotated: true,
      message: 'Release notes',
    });
    expect(created.success).toBe(true);

    const show = await git(repo, ['show', 'release', '--no-patch', '--pretty=%D']);
    expect(show.stdout).toContain('tag: release');
  });
});

describe('per-commit signing flags', () => {
  let repo = '';

  beforeEach(async () => {
    repo = await initRepo();
  });

  afterEach(() => {
    if (repo) rmSync(repo, { recursive: true, force: true });
  });

  it('accepts sign:false without failing when signing is disabled', async () => {
    writeFileSync(join(repo, 'README.md'), 'unsigned\n');
    await stageAll(repo);
    const result = await createCommit(repo, {
      message: 'no sign',
      sign: false,
    });
    expect(result.success).toBe(true);
    expect(result.data?.sha).toMatch(/^[0-9a-f]{40}$/);
  });
});

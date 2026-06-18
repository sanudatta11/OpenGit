// electron/main/git/lifecycle.ts — repository create/clone helpers.

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { gitRun } from './client';
import type { RepoCreateInput, RepoCloneInput, WriteResult } from '@shared/ipc';

export function inferCloneRepoName(url: string): string {
  const trimmed = url.trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  const afterColon = trimmed.includes(':') && !trimmed.includes('://')
    ? trimmed.slice(trimmed.lastIndexOf(':') + 1)
    : trimmed;
  const raw = basename(afterColon).replace(/\.git$/i, '');
  return raw || 'repository';
}

export function resolveCreateTarget(input: RepoCreateInput): string {
  const root = resolve(input.path);
  return input.repoName ? join(root, input.repoName) : root;
}

export function buildCloneArgs(input: RepoCloneInput): string[] {
  const args = ['clone'];
  if (input.recursiveSubmodules) args.push('--recurse-submodules');
  if (input.shallowDepth) args.push('--depth', String(input.shallowDepth));
  args.push(input.url, input.repoName ?? inferCloneRepoName(input.url));
  return args;
}

export async function createRepository(input: RepoCreateInput): Promise<WriteResult<{ path: string }>> {
  const target = resolveCreateTarget(input);
  if (!existsSync(target)) mkdirSync(target, { recursive: true });

  const args = ['init'];
  if (input.bare) args.push('--bare');
  if (input.defaultBranch) args.push('--initial-branch', input.defaultBranch);

  const init = await gitRun({
    cwd: target,
    args,
    channel: 'repo:create',
    reject: false,
  });

  if (!init.ok) {
    return {
      success: false,
      stdout: init.stdout,
      stderr: init.stderr,
      changedRefs: [],
      requiresRefresh: false,
    };
  }

  if (!input.bare) {
    if (input.readme) writeFileSync(join(target, 'README.md'), `# ${basename(target)}\n`, 'utf8');
    if (input.gitignore) writeFileSync(join(target, '.gitignore'), `${input.gitignore.trim()}\n`, 'utf8');
    if (input.license) writeFileSync(join(target, 'LICENSE'), licenseText(input.license), 'utf8');
  }

  return {
    success: true,
    data: { path: target },
    stdout: init.stdout,
    stderr: init.stderr,
    changedRefs: ['HEAD'],
    requiresRefresh: true,
  };
}

export async function cloneRepository(input: RepoCloneInput): Promise<WriteResult<{ path: string }>> {
  const parent = resolve(input.destinationParent);
  if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
  const repoName = input.repoName ?? inferCloneRepoName(input.url);
  const args = buildCloneArgs({ ...input, repoName });

  const clone = await gitRun({
    cwd: parent,
    args,
    channel: 'repo:clone',
    reject: false,
  });

  return {
    success: clone.ok,
    data: clone.ok ? { path: join(parent, repoName) } : undefined,
    stdout: clone.stdout,
    stderr: clone.stderr,
    changedRefs: clone.ok ? ['HEAD', 'refs/remotes'] : [],
    requiresRefresh: clone.ok,
  };
}

function licenseText(kind: NonNullable<RepoCreateInput['license']>): string {
  if (kind === 'Apache-2.0') return 'Apache License\nVersion 2.0\n';
  if (kind === 'GPL-3.0') return 'GNU GENERAL PUBLIC LICENSE\nVersion 3\n';
  return 'MIT License\n\nCopyright (c)\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software.\n';
}

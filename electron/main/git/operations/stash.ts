import { join } from 'node:path';
import type { WriteResult } from '@shared/ipc';
import type { StashEntry } from '@shared/git';
import { gitRun } from '../client';
import { parseStashList, STASH_LIST_FORMAT } from '../parse';
import { toWriteResult } from './commandResult';
import { probeState } from './state';

export async function listStashes(workTree: string): Promise<StashEntry[]> {
  const result = await gitRun({
    cwd: workTree,
    args: ['stash', 'list', `--format=${STASH_LIST_FORMAT}`],
    channel: 'stash:list',
    reject: false,
  });
  return result.ok && result.stdout ? parseStashList(result.stdout) : [];
}

export interface StashCreateOptions {
  message?: string;
  includeUntracked?: boolean;
  keepIndex?: boolean;
}

export async function createStash(
  workTree: string,
  opts: StashCreateOptions,
): Promise<WriteResult> {
  const args = ['stash', 'push'];
  if (opts.message) args.push('-m', opts.message);
  if (opts.includeUntracked) args.push('--include-untracked');
  if (opts.keepIndex) args.push('--keep-index');
  const result = await gitRun({ cwd: workTree, args, channel: 'stash:create', reject: false });
  const noChanges = /no local changes/i.test(`${result.stdout}\n${result.stderr}`);
  return toWriteResult(result, {
    data: { noChanges },
    changedRefs: (ok) => ok && !noChanges ? ['refs/stash'] : [],
  });
}

async function restoreStash(
  workTree: string,
  command: 'apply' | 'pop',
  ref: string,
  keepIndex: boolean,
): Promise<WriteResult> {
  const args = ['stash', command];
  if (keepIndex) args.push('--index');
  args.push(ref);
  const result = await gitRun({
    cwd: workTree,
    args,
    channel: `stash:${command}`,
    reject: false,
  });
  const hasConflicts = /CONFLICT|Merge conflict/i.test(`${result.stderr}\n${result.stdout}`);
  return toWriteResult(result, {
    changedRefs: (ok) => command === 'pop' && ok ? ['refs/stash'] : [],
    requiresRefresh: true,
    state: hasConflicts ? await probeState(workTree, join(workTree, '.git')) : undefined,
  });
}

export function applyStash(
  workTree: string,
  ref: string,
  keepIndex: boolean,
): Promise<WriteResult> {
  return restoreStash(workTree, 'apply', ref, keepIndex);
}

export function popStash(
  workTree: string,
  ref: string,
  keepIndex: boolean,
): Promise<WriteResult> {
  return restoreStash(workTree, 'pop', ref, keepIndex);
}

export async function dropStash(workTree: string, ref: string): Promise<WriteResult> {
  const result = await gitRun({
    cwd: workTree,
    args: ['stash', 'drop', ref],
    channel: 'stash:drop',
    reject: false,
  });
  return toWriteResult(result, { changedRefs: ['refs/stash'] });
}

export async function stashDiff(workTree: string, ref: string): Promise<string> {
  const result = await gitRun({
    cwd: workTree,
    args: ['stash', 'show', '-p', ref],
    channel: 'stash:diff',
    reject: false,
  });
  return result.ok ? result.stdout : '';
}

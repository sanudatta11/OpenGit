import type { WriteResult } from '@shared/ipc';
import { gitRun, gitText } from '../client';
import { toWriteResult } from './commandResult';

export async function fetchRemote(
  workTree: string,
  remote: string,
  prune: boolean,
): Promise<WriteResult<{ fetched: number; pruned: readonly string[] }>> {
  const args = ['fetch'];
  if (prune) args.push('--prune');
  args.push(remote);
  const result = await gitRun({ cwd: workTree, args, channel: 'remote:fetch', reject: false });
  if (!result.ok) return toWriteResult(result);
  const fetched = (result.stderr.match(/->\s/g) ?? []).length;
  const pruned = (result.stderr.match(/\[deleted\]\s+\S+\s+->\s+(\S+)/g) ?? []).map(String);
  return toWriteResult(result, {
    data: { fetched, pruned },
    changedRefs: ['refs/remotes'],
  });
}

export async function pullRemote(
  workTree: string,
  remote: string,
  branch: string | undefined,
  ffOnly: boolean,
  strategy?: 'merge' | 'rebase' | 'ff-only',
): Promise<WriteResult> {
  const args = ['pull'];
  const resolvedStrategy = strategy ?? (ffOnly ? 'ff-only' : undefined);
  if (resolvedStrategy === 'ff-only') args.push('--ff-only');
  if (resolvedStrategy === 'rebase') args.push('--rebase');
  if (resolvedStrategy === 'merge') args.push('--no-rebase');
  args.push(remote);
  if (branch) args.push(branch);
  const result = await gitRun({ cwd: workTree, args, channel: 'remote:pull', reject: false });
  return toWriteResult(result, { changedRefs: ['HEAD', 'refs/remotes'] });
}

export async function fetchAllRemotes(
  workTree: string,
  prune: boolean,
): Promise<WriteResult<{ fetched: number }>> {
  const args = ['fetch', '--all'];
  if (prune) args.push('--prune');
  const result = await gitRun({ cwd: workTree, args, channel: 'remote:fetchAll', reject: false });
  return toWriteResult(result, {
    data: { fetched: (result.stderr.match(/->\s/g) ?? []).length },
    changedRefs: (ok) => ok ? ['refs/remotes'] : [],
  });
}

export async function pushRemote(
  workTree: string,
  remote: string,
  branch: string | undefined,
  forceWithLease: boolean,
  setUpstream: boolean,
): Promise<WriteResult<{ pushed: number; rejected: boolean; remoteHead: string | null }>> {
  const args = ['push'];
  if (forceWithLease) args.push('--force-with-lease');
  if (setUpstream) args.push('-u');
  args.push(remote);
  if (branch) args.push(branch);
  const result = await gitRun({ cwd: workTree, args, channel: 'remote:push', reject: false });
  const rejected = !result.ok &&
    /!\s*\[rejected\]|non-fast-forward|fetch first|updates were rejected/i.test(
      `${result.stderr}\n${result.stdout}`,
    );
  let remoteHead: string | null = null;
  if (result.ok && branch) {
    try {
      remoteHead = (await gitText({
        cwd: workTree,
        args: ['rev-parse', `${remote}/${branch}`],
        channel: 'remote:push',
      })).trim();
    } catch {
      // The push succeeded; tracking-ref lookup is best-effort.
    }
  }
  return toWriteResult(result, {
    data: {
      pushed: result.ok ? (result.stderr.match(/->\s/g) ?? []).length : 0,
      rejected,
      remoteHead,
    },
    changedRefs: (ok) => ok ? ['refs/remotes'] : [],
  });
}

export async function listSubmodules(
  workTree: string,
): Promise<{ path: string; url: string; branch: string; sha: string }[]> {
  const result = await gitRun({
    cwd: workTree,
    args: ['submodule', 'status', '--recursive'],
    channel: 'submodule:list',
    reject: false,
  });
  if (!result.ok || !result.stdout) return [];
  return result.stdout.split('\n').filter(Boolean).flatMap((line) => {
    const match = line.trim().match(/^[\s+]?([0-9a-f]{40})\s+(\S+)\s+(?:\((.+)\))?/);
    return match
      ? [{
          path: match[2]!,
          url: '',
          branch: match[3]?.replace('heads/', '') ?? '',
          sha: match[1]!,
        }]
      : [];
  });
}

export async function initSubmodules(workTree: string, recursive: boolean): Promise<WriteResult> {
  const args = ['submodule', 'update', '--init'];
  if (recursive) args.push('--recursive');
  const result = await gitRun({ cwd: workTree, args, channel: 'submodule:init', reject: false });
  return toWriteResult(result);
}

export async function deinitSubmodule(
  workTree: string,
  path: string,
  force: boolean,
): Promise<WriteResult> {
  const args = ['submodule', 'deinit'];
  if (force) args.push('--force');
  args.push(path);
  const result = await gitRun({ cwd: workTree, args, channel: 'submodule:deinit', reject: false });
  return toWriteResult(result);
}

export async function listLFSTracked(workTree: string): Promise<string[]> {
  const result = await gitRun({
    cwd: workTree,
    args: ['lfs', 'track'],
    channel: 'lfs:list',
    reject: false,
  });
  if (!result.ok || !result.stdout) return [];
  return result.stdout
    .split('\n')
    .filter((line) => line.includes('('))
    .map((line) => line.split('(')[0]!.trim())
    .filter(Boolean);
}

async function setLfsTracking(
  workTree: string,
  command: 'track' | 'untrack',
  pattern: string,
): Promise<WriteResult> {
  const result = await gitRun({
    cwd: workTree,
    args: ['lfs', command, pattern],
    channel: `lfs:${command}`,
    reject: false,
  });
  return toWriteResult(result, { changedRefs: ['.gitattributes'] });
}

export function lfsTrack(workTree: string, pattern: string): Promise<WriteResult> {
  return setLfsTracking(workTree, 'track', pattern);
}

export function lfsUntrack(workTree: string, pattern: string): Promise<WriteResult> {
  return setLfsTracking(workTree, 'untrack', pattern);
}

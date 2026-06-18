// electron/main/git/previews.ts — read-only operation previews.

import { gitRun } from './client';
import type {
  MergePreview,
  OperationPreviewCommit,
  OperationPreviewFile,
  PullPreview,
  PushPreview,
  RebasePlan,
} from '@shared/ipc';

const PREVIEW_FORMAT = '%H%x1f%an%x1f%s';

export async function mergePreview(workTree: string, sourceRef: string): Promise<MergePreview> {
  const target = await currentBranch(workTree);
  const fastForward = await isAncestor(workTree, 'HEAD', sourceRef);
  const commits = await previewCommits(workTree, `HEAD..${sourceRef}`);
  const files = await previewFiles(workTree, `HEAD..${sourceRef}`);
  return { source: sourceRef, target, fastForward, commits, files };
}

export async function pullPreview(workTree: string, remote: string, branch?: string): Promise<PullPreview> {
  const current = await currentBranch(workTree);
  const targetBranch = branch || current || 'HEAD';
  const upstream = `${remote}/${targetBranch}`;
  const incoming = await previewCommits(workTree, `HEAD..${upstream}`);
  const local = await previewCommits(workTree, `${upstream}..HEAD`);
  const clean = (await gitRun({
    cwd: workTree,
    args: ['status', '--porcelain'],
    channel: 'operation:pullPreview',
    reject: false,
  })).stdout.trim().length === 0;
  const recommendedStrategy = incoming.length > 0 && local.length === 0
    ? 'ff-only'
    : clean
      ? 'rebase'
      : 'merge';
  return { remote, branch: targetBranch, upstream, incoming, local, recommendedStrategy };
}

export async function pushPreview(workTree: string, remote: string, branch?: string): Promise<PushPreview> {
  const current = await currentBranch(workTree);
  const targetBranch = branch || current || 'HEAD';
  const upstream = `${remote}/${targetBranch}`;
  const outgoing = await previewCommits(workTree, `${upstream}..HEAD`);
  const behind = await countCommits(workTree, `HEAD..${upstream}`);
  return { remote, branch: targetBranch, upstream, outgoing, behind };
}

export async function rebasePlan(workTree: string, onto: string): Promise<RebasePlan> {
  const current = await currentBranch(workTree);
  const commits = await previewCommits(workTree, `${onto}..HEAD`);
  const files = await previewFiles(workTree, `${onto}..HEAD`);
  return { onto, currentBranch: current, commits, files };
}

export async function previewCommits(workTree: string, range: string): Promise<OperationPreviewCommit[]> {
  const r = await gitRun({
    cwd: workTree,
    args: ['log', `--pretty=format:${PREVIEW_FORMAT}`, range],
    channel: 'operation:preview',
    reject: false,
  });
  if (!r.ok || !r.stdout.trim()) return [];
  return r.stdout.split('\n').filter(Boolean).map((line) => {
    const [sha = '', author = '', subject = ''] = line.split('\x1f');
    return { sha, author, subject };
  });
}

export async function previewFiles(workTree: string, range: string): Promise<OperationPreviewFile[]> {
  const r = await gitRun({
    cwd: workTree,
    args: ['diff', '--numstat', range],
    channel: 'operation:preview',
    reject: false,
  });
  if (!r.ok || !r.stdout.trim()) return [];
  return r.stdout.split('\n').filter(Boolean).map((line) => {
    const [additions = '0', deletions = '0', path = ''] = line.split('\t');
    return {
      path,
      additions: additions === '-' ? 0 : Number(additions),
      deletions: deletions === '-' ? 0 : Number(deletions),
    };
  });
}

async function currentBranch(workTree: string): Promise<string | null> {
  const r = await gitRun({
    cwd: workTree,
    args: ['branch', '--show-current'],
    channel: 'operation:preview',
    reject: false,
  });
  const branch = r.stdout.trim();
  return branch || null;
}

async function isAncestor(workTree: string, ancestor: string, descendant: string): Promise<boolean> {
  const r = await gitRun({
    cwd: workTree,
    args: ['merge-base', '--is-ancestor', ancestor, descendant],
    channel: 'operation:mergePreview',
    reject: false,
  });
  return r.ok;
}

async function countCommits(workTree: string, range: string): Promise<number> {
  const r = await gitRun({
    cwd: workTree,
    args: ['rev-list', '--count', range],
    channel: 'operation:preview',
    reject: false,
  });
  return r.ok ? Number(r.stdout.trim() || 0) : 0;
}

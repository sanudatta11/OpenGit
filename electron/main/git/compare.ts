// electron/main/git/compare.ts — branch comparison (ahead/behind commits + files).

import { gitRun } from './client';
import type { BranchCompareResult, BranchCompareFile, OperationPreviewCommit } from '@shared/ipc';

const PREVIEW_FORMAT = '%H%x1f%an%x1f%s';

export async function compareBranches(workTree: string, branchA: string, branchB: string): Promise<BranchCompareResult> {
  // 1. Ahead/behind counts
  const countR = await gitRun({
    cwd: workTree,
    args: ['rev-list', '--left-right', '--count', `${branchA}...${branchB}`],
    channel: 'branch:compare',
    reject: false,
  });
  let aheadCount = 0;
  let behindCount = 0;
  if (countR.ok && countR.stdout.trim()) {
    const parts = countR.stdout.trim().split('\t');
    aheadCount = Number(parts[0] ?? 0);
    behindCount = Number(parts[1] ?? 0);
  }

  // 2. Ahead commits (in A not in B)
  const aheadCommits = await fetchCommits(workTree, `${branchB}..${branchA}`);

  // 3. Behind commits (in B not in A)
  const behindCommits = await fetchCommits(workTree, `${branchA}..${branchB}`);

  // 4. Files — name-status for status letter, numstat for +/- counts
  const nameStatusR = await gitRun({
    cwd: workTree,
    args: ['diff', '--name-status', `${branchA}...${branchB}`],
    channel: 'branch:compare',
    reject: false,
  });

  const numstatR = await gitRun({
    cwd: workTree,
    args: ['diff', '--numstat', `${branchA}...${branchB}`],
    channel: 'branch:compare',
    reject: false,
  });

  const files = mergeFileResults(nameStatusR.stdout, numstatR.stdout);

  return { aheadCount, behindCount, aheadCommits, behindCommits, files };
}

async function fetchCommits(workTree: string, range: string): Promise<readonly OperationPreviewCommit[]> {
  const r = await gitRun({
    cwd: workTree,
    args: ['log', `--pretty=format:${PREVIEW_FORMAT}`, range],
    channel: 'branch:compare',
    reject: false,
  });
  if (!r.ok || !r.stdout.trim()) return [];
  return r.stdout.split('\n').filter(Boolean).map((line) => {
    const [sha = '', author = '', subject = ''] = line.split('\x1f');
    return { sha, author, subject };
  });
}

function mergeFileResults(nameStatusOutput: string, numstatOutput: string): readonly BranchCompareFile[] {
  const statusMap = new Map<string, { status: string; oldPath: string | null }>();
  for (const line of nameStatusOutput.split('\n').filter(Boolean)) {
    const parts = line.split('\t');
    const statusLetter = parts[0]?.[0] ?? '';
    const path = parts[1] ?? '';
    const oldPath = parts.length > 2 ? parts[2]! : null;
    statusMap.set(path, { status: statusLetter, oldPath });
  }

  const numstatMap = new Map<string, { additions: number; deletions: number }>();
  for (const line of numstatOutput.split('\n').filter(Boolean)) {
    const parts = line.split('\t');
    const additions = parts[0] === '-' ? 0 : Number(parts[0] ?? 0);
    const deletions = parts[1] === '-' ? 0 : Number(parts[1] ?? 0);
    const path = parts[2] ?? '';
    numstatMap.set(path, { additions, deletions });
  }

  const files: BranchCompareFile[] = [];

  // Iterate over the union of both maps
  const allPaths = new Set([...statusMap.keys(), ...numstatMap.keys()]);
  for (const path of allPaths) {
    const s = statusMap.get(path);
    const n = numstatMap.get(path);
    const status = mapStatus(s?.status ?? 'M');
    files.push({
      path,
      status,
      additions: n?.additions ?? 0,
      deletions: n?.deletions ?? 0,
      oldPath: s?.oldPath ?? null,
    });
  }

  return files;
}

function mapStatus(letter: string): BranchCompareFile['status'] {
  switch (letter) {
    case 'A': return 'added';
    case 'M': return 'modified';
    case 'D': return 'deleted';
    case 'R': return 'renamed';
    case 'C': return 'copied';
    default: return 'modified';
  }
}

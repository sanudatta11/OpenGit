import type { InProgressState } from '@shared/git';
import { gitRun } from '../client';
import { parseInProgressState, withConflicts } from '../parse';

export async function probeState(
  workTree: string,
  gitDir: string,
): Promise<readonly InProgressState[]> {
  const base = parseInProgressState(gitDir, workTree);
  let conflicts: string[] = [];
  if (base.length > 0) {
    const result = await gitRun({
      cwd: workTree,
      args: ['diff', '--name-only', '--diff-filter=U', '-z'],
      channel: 'repo:state',
      reject: false,
    });
    if (result.ok) {
      conflicts = result.stdout.split('\0').filter(Boolean);
    }
  }
  return withConflicts(base, conflicts);
}

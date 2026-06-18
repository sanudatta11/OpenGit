// electron/main/git/parse/worktree.ts — parse `git worktree list --porcelain`.

import type { Worktree } from '@shared/git';

/**
 * Parse `git worktree list --porcelain` output.
 * Format (blank-line separated blocks):
 *   worktree /path/to/wt
 *   HEAD <sha>
 *   branch refs/heads/branchname
 *   detached
 *   locked <reason>
 *   prunable
 *   bare
 *
 * Each block is terminated by a blank line.
 */
export function parseWorktrees(raw: string): Worktree[] {
  const blocks = raw.split('\n\n');
  const worktrees: Worktree[] = [];

  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.length > 0);
    if (lines.length === 0) continue;

    let path = '';
    let head: string | null = null;
    let branch: string | null = null;
    let detached = false;
    let bare = false;
    let locked: string | null = null;
    let prunable = false;

    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        path = line.slice('worktree '.length);
      } else if (line.startsWith('HEAD ')) {
        head = line.slice('HEAD '.length);
      } else if (line.startsWith('branch ')) {
        branch = line.slice('branch '.length);
      } else if (line === 'detached') {
        detached = true;
      } else if (line === 'bare') {
        bare = true;
      } else if (line === 'prunable') {
        prunable = true;
      } else if (line.startsWith('locked ')) {
        locked = line.slice('locked '.length);
      } else if (line === 'locked') {
        locked = '';
      }
    }

    if (!path) continue;

    worktrees.push({
      path,
      head,
      branch,
      detached,
      bare,
      locked,
      prunable,
      isMain: worktrees.length === 0, // first worktree is the main one
    });
  }

  return worktrees;
}

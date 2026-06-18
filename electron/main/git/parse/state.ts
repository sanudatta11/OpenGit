// electron/main/git/parse/state.ts — probe .git/ for in-progress operations.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { InProgressState, OperationKind } from '@shared/git';

/**
 * Detect in-progress git operations by probing .git for sentinel files/dirs.
 *
 * - merge:        .git/MERGE_HEAD
 * - rebase:       .git/rebase-merge/ or .git/rebase-apply/
 * - cherry-pick:  .git/CHERRY_PICK_HEAD
 * - revert:       .git/REVERT_HEAD
 * - bisect:       .git/BISECT_LOG
 *
 * Conflicting paths are read from .git/index via `git diff --name-only --diff-filter=U`,
 * but we do that lazily from the IPC handler (to keep parsers pure & synchronous).
 * Here we only return the kind + step counters (for rebase).
 */
export function parseInProgressState(gitDir: string, _workTreeRoot: string): InProgressState[] {
  const states: InProgressState[] = [];

  // Rebase (check merge-style first; --merge variant is more common in modern git)
  const rebaseMerge = join(gitDir, 'rebase-merge');
  const rebaseApply = join(gitDir, 'rebase-apply');
  const rebaseDir = existsSync(rebaseMerge) ? rebaseMerge : existsSync(rebaseApply) ? rebaseApply : null;

  if (rebaseDir) {
    const isInteractive = existsSync(rebaseMerge);
    let currentStep: number | null = null;
    let totalSteps: number | null = null;
    try {
      const msgNum = readFileSync(join(rebaseDir, 'msgnum'), 'utf8').trim();
      const endNum = readFileSync(join(rebaseDir, 'end'), 'utf8').trim();
      currentStep = Number(msgNum);
      totalSteps = Number(endNum);
    } catch {
      // rebase-apply uses different names; leave null
    }
    let onto: string | null = null;
    try {
      onto = readFileSync(join(rebaseDir, 'onto'), 'utf8').trim();
    } catch {
      // not present in rebase-apply
    }
    states.push({
      kind: 'rebase',
      onto,
      currentStep,
      totalSteps,
      conflictingPaths: [], // filled by IPC handler via git diff --diff-filter=U
      canAbort: true,
      canContinue: true,
      canSkip: isInteractive, // skip only meaningful in interactive/merge rebase
    });
  }

  // Merge
  if (existsSync(join(gitDir, 'MERGE_HEAD'))) {
    let onto: string | null = null;
    try {
      onto = readFileSync(join(gitDir, 'MERGE_HEAD'), 'utf8').trim();
    } catch {
      // ignore
    }
    states.push({
      kind: 'merge',
      onto,
      currentStep: null,
      totalSteps: null,
      conflictingPaths: [],
      canAbort: true,
      canContinue: true,
      canSkip: false,
    });
  }

  // Cherry-pick
  if (existsSync(join(gitDir, 'CHERRY_PICK_HEAD'))) {
    let onto: string | null = null;
    try {
      onto = readFileSync(join(gitDir, 'CHERRY_PICK_HEAD'), 'utf8').trim();
    } catch {
      // ignore
    }
    states.push({
      kind: 'cherry-pick',
      onto,
      currentStep: null,
      totalSteps: null,
      conflictingPaths: [],
      canAbort: true,
      canContinue: true,
      canSkip: false,
    });
  }

  // Revert
  if (existsSync(join(gitDir, 'REVERT_HEAD'))) {
    let onto: string | null = null;
    try {
      onto = readFileSync(join(gitDir, 'REVERT_HEAD'), 'utf8').trim();
    } catch {
      // ignore
    }
    states.push({
      kind: 'revert',
      onto,
      currentStep: null,
      totalSteps: null,
      conflictingPaths: [],
      canAbort: true,
      canContinue: true,
      canSkip: false,
    });
  }

  // Bisect
  if (existsSync(join(gitDir, 'BISECT_LOG'))) {
    states.push({
      kind: 'bisect',
      onto: null,
      currentStep: null,
      totalSteps: null,
      conflictingPaths: [],
      canAbort: true,
      canContinue: false,
      canSkip: false,
    });
  }

  return states;
}

/**
 * Fill conflictingPaths on each InProgressState by running
 * `git diff --name-only --diff-filter=U`. Caller supplies the paths list.
 */
export function withConflicts(
  states: readonly InProgressState[],
  conflictingPaths: readonly string[],
): InProgressState[] {
  if (conflictingPaths.length === 0) return [...states];
  return states.map((s) => ({ ...s, conflictingPaths }));
}

export type { OperationKind };

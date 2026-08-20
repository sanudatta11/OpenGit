import { describe, expect, it } from 'vitest';
import {
  classifyCommandFailure,
  friendlyForGitError,
  toWriteResult,
} from '../../electron/main/git/operations/commandResult';

describe('toWriteResult', () => {
  it('translates a successful command and resolves success-dependent metadata', () => {
    const result = toWriteResult(
      { ok: true, stdout: 'done', stderr: '', exitCode: 0 },
      {
        data: { sha: 'abc123' },
        changedRefs: (ok) => ok ? ['HEAD'] : [],
        requiresRefresh: (ok) => ok,
      },
    );

    expect(result).toEqual({
      success: true,
      data: { sha: 'abc123' },
      stdout: 'done',
      stderr: '',
      changedRefs: ['HEAD'],
      requiresRefresh: true,
    });
  });

  it('preserves failed command output and defaults to no refresh', () => {
    expect(toWriteResult({
      ok: false,
      stdout: 'partial output',
      stderr: 'fatal: failed',
      exitCode: 1,
    })).toEqual({
      success: false,
      stdout: 'partial output',
      stderr: 'fatal: failed',
      changedRefs: [],
      requiresRefresh: false,
    });
  });

  it('allows conflict operations to require refresh and expose state on failure', () => {
    const state = [{
      kind: 'merge' as const,
      onto: null,
      currentStep: null,
      totalSteps: null,
      conflictingPaths: ['file.txt'],
      canAbort: true,
      canContinue: false,
      canSkip: false,
    }];
    const result = toWriteResult(
      { ok: false, stdout: '', stderr: 'CONFLICT', exitCode: 1 },
      { requiresRefresh: true, state },
    );

    expect(result.requiresRefresh).toBe(true);
    expect(result.state).toEqual(state);
  });
});

describe('classifyCommandFailure', () => {
  it.each([
    ['fatal: not a git repository', 128, 'NotARepo'],
    ['fatal: detected dubious ownership', 128, 'NotARepo'],
    ['CONFLICT (content): Merge conflict', 1, 'Conflicts'],
    ['Your local changes would be overwritten by checkout', 1, 'UncommittedChanges'],
    ['! [rejected] main -> main (non-fast-forward)', 1, 'Rejected'],
    ['fatal: feature not found', 128, 'NotSupported'],
    ['fatal: unknown failure', 1, 'GitFailed'],
  ] as const)('maps %s to %s', (stderr, exitCode, expected) => {
    expect(classifyCommandFailure({ stderr, exitCode })).toBe(expected);
  });

  it('classifies errors emitted on stdout', () => {
    expect(classifyCommandFailure({
      stdout: 'Updates were rejected because the remote contains work',
      stderr: '',
      exitCode: 1,
    })).toBe('Rejected');
  });
});

describe('friendlyForGitError', () => {
  it('uses the first stderr line for unknown git failures', () => {
    expect(friendlyForGitError('GitFailed', 'fatal: first line\nmore detail')).toBe('fatal: first line');
  });
});

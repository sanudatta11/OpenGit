import type { GitErrorCode } from '@shared/ipc';
import type { WriteResult } from '@shared/ipc';
import type { InProgressState } from '@shared/git';
import type { GitRunResult } from '../client';

type ResultValue<T> = T | ((success: boolean) => T);

export interface WriteResultOptions<T = never> {
  readonly data?: T;
  readonly changedRefs?: ResultValue<readonly string[]>;
  readonly requiresRefresh?: ResultValue<boolean>;
  readonly state?: readonly InProgressState[];
}

function resolve<T>(value: ResultValue<T> | undefined, success: boolean, fallback: T): T {
  if (typeof value === 'function') {
    return (value as (ok: boolean) => T)(success);
  }
  return value ?? fallback;
}

/**
 * Translate the low-level git result into the stable IPC write envelope.
 * Callers only provide operation-specific data and refresh/ref metadata.
 */
export function toWriteResult<T = never>(
  result: GitRunResult,
  options: WriteResultOptions<T> = {},
): WriteResult<T> {
  const envelope: WriteResult<T> = {
    success: result.ok,
    stdout: result.stdout,
    stderr: result.stderr,
    changedRefs: resolve(options.changedRefs, result.ok, []),
    requiresRefresh: resolve(options.requiresRefresh, result.ok, result.ok),
  };

  if (options.data !== undefined) {
    (envelope as { data?: T }).data = options.data;
  }
  if (options.state !== undefined) {
    (envelope as { state?: readonly InProgressState[] }).state = options.state;
  }
  return envelope;
}

export interface CommandFailure {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
}

/** Map stable git output to the public structured error categories. */
export function classifyCommandFailure(result: CommandFailure): GitErrorCode {
  const output = `${result.stderr ?? ''}\n${result.stdout ?? ''}`.toLowerCase();
  if (
    output.includes('not a git repository') ||
    output.includes('does not have a commit checked out') ||
    output.includes('dubious ownership') ||
    output.includes('detected dubious ownership')
  ) {
    return 'NotARepo';
  }
  if (output.includes('conflict') || output.includes('could not apply')) {
    return 'Conflicts';
  }
  if (
    output.includes('your local changes') ||
    output.includes('would be overwritten') ||
    output.includes('please commit your changes')
  ) {
    return 'UncommittedChanges';
  }
  if (/!\s*\[rejected\]|non-fast-forward|failed to push|updates were rejected/.test(output)) {
    return 'Rejected';
  }
  if (result.exitCode === 128 && output.includes('not found')) {
    return 'NotSupported';
  }
  return 'GitFailed';
}

export function friendlyForGitError(code: GitErrorCode, stderr: string): string {
  switch (code) {
    case 'NotARepo':
      if (stderr.toLowerCase().includes('dubious ownership')) {
        return 'This repository is owned by another user. Git refused to read it for security. Add a safe.directory exception in Settings, or run: git config --global --add safe.directory <path>';
      }
      return 'This path is not inside a Git repository.';
    case 'Conflicts':
      return 'Git stopped because of conflicts. Resolve them, then continue the operation.';
    case 'UncommittedChanges':
      return 'Git refused because there are uncommitted changes. Stash or commit first.';
    case 'Rejected':
      return 'The remote rejected the push (non-fast-forward). Fetch and rebase or merge first.';
    case 'Cancelled':
      return 'The operation was cancelled.';
    case 'NotSupported':
      return 'This Git operation is not supported by your installed git version.';
    case 'GitNotFound':
      return 'OpenGit could not find the git executable.';
    default:
      return stderr.trim().split('\n')[0] || 'Git reported an error.';
  }
}

// electron/main/git/client.ts — execa wrapper, git binary discovery,
// AbortController tracking, structured errors. Single point of contact with git.

import { execa, type ResultPromise } from 'execa';
import { existsSync } from 'node:fs';
import { nanoid } from 'nanoid/non-secure';
import { GitError, type GitErrorShape, type GitErrorCode } from '@shared/ipc';
import { logStore } from '../log/emitter';

export interface GitRunOptions {
  cwd: string;
  args: readonly string[];
  /** String content to pipe to the child's stdin (execa v9 `input`). */
  input?: string;
  signal?: AbortSignal;
  /** When true, non-zero exit is returned as a value instead of throwing. */
  reject?: boolean;
  /** Channel name to record under in the operation log. */
  channel: string;
  /** Hide argv from logs (e.g. for tokens). Default false. */
  redactArgv?: boolean;
  /** Extra environment variables to set for this git call. Merged after defaults. */
  env?: Record<string, string>;
}

export interface GitRunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  ok: boolean;
}

let gitBinPath: string | null = null;

/**
 * Locate the git executable. Called once at startup. Throws GitError(GitNotFound)
 * if not on PATH and no override configured.
 */
export async function discoverGitBin(override?: string): Promise<string> {
  if (override) {
    if (!existsSync(override)) {
      throw new GitError({
        code: 'GitNotFound',
        message: `Configured git path does not exist: ${override}`,
        stdout: '',
        stderr: '',
        friendly: `OpenGit can't find git at the configured path: ${override}. Update it in Settings.`,
      });
    }
    gitBinPath = override;
    return override;
  }

  // Prefer explicit common locations, then PATH lookup.
  const candidates =
    process.platform === 'win32'
      ? ['C:\\Program Files\\Git\\bin\\git.exe', 'C:\\Program Files (x86)\\Git\\bin\\git.exe']
      : ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'];

  for (const c of candidates) {
    if (existsSync(c)) {
      gitBinPath = c;
      return c;
    }
  }

  // Fallback: rely on PATH resolution by using bare 'git'. execa will resolve it.
  try {
    const probe = await execa('git', ['--version'], { reject: false });
    if (probe.exitCode === 0) {
      gitBinPath = 'git';
      return 'git';
    }
  } catch {
    // fall through
  }

  throw new GitError({
    code: 'GitNotFound',
    message: 'git executable not found on PATH or common locations',
    stdout: '',
    stderr: '',
    friendly:
      "OpenGit can't find git installed on this system. Install git or set its path in Settings.",
  });
}

export function getGitBin(): string {
  if (!gitBinPath) {
    // Lazy discovery if not initialized (e.g. in tests where globalSetup ran in a different process).
    // Try common locations synchronously.
    const candidates =
      process.platform === 'win32'
        ? ['C:\\Program Files\\Git\\bin\\git.exe', 'C:\\Program Files (x86)\\Git\\bin\\git.exe']
        : ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git'];
    for (const c of candidates) {
      if (existsSync(c)) {
        gitBinPath = c;
        return c;
      }
    }
    // Fall back to bare 'git' (PATH resolution happens at exec time).
    gitBinPath = 'git';
    return 'git';
  }
  return gitBinPath;
}

/** Active child processes for cancellation + window-close cleanup. */
const active = new Map<string, ResultPromise>();

export function cancelAll(): void {
  for (const child of active.values()) {
    try {
      void child.kill('SIGTERM');
    } catch {
      // already exited
    }
  }
  active.clear();
}

export async function gitRun(opts: GitRunOptions): Promise<GitRunResult> {
  const bin = getGitBin();
  const callId = nanoid(8);
  const startTs = Date.now();
  const argv = [bin, ...opts.args];

  let child: ResultPromise;
  try {
    const execOpts: Record<string, unknown> = {
      cwd: opts.cwd,
      signal: opts.signal,
      reject: false,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0', // never prompt for credentials interactively
        GIT_PAGER: 'cat', // never invoke a pager
        GIT_EDITOR: 'true', // never wait for editor input
        LC_ALL: 'C', // stable parser output
        GIT_OPTIONAL_LOCKS: '0', // don't block concurrent git processes
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: 'protocol.file.allow',
        GIT_CONFIG_VALUE_0: 'always',
        ...opts.env, // caller env overrides win — used for GIT_SEQUENCE_EDITOR etc.
      },
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    };
    if (opts.input) execOpts.input = opts.input;
    child = execa(bin, opts.args as string[], execOpts);
  } catch (err) {
    const shape = toGitErrorShape(err, argv, opts.channel, 'GitFailed');
    logStore.push({
      id: callId,
      ts: startTs,
      channel: opts.channel,
      argv: opts.redactArgv ? ['git', '<redacted>'] : argv,
      exitCode: null,
      stdout: '',
      stderr: shape.stderr,
      durationMs: Date.now() - startTs,
      ok: false,
    });
    throw new GitError(shape);
  }

  active.set(callId, child);

  let result;
  try {
    result = await child;
  } catch (err) {
    // Aborted via AbortSignal, or other spawn error.
    active.delete(callId);
    const cancelled = (err as NodeJS.ErrnoException)?.name === 'AbortError' ||
      (err as { signal?: string })?.signal === 'SIGTERM';
    const code: GitErrorCode = cancelled ? 'Cancelled' : 'GitFailed';
    const shape = toGitErrorShape(err, argv, opts.channel, code);
    logStore.push({
      id: callId,
      ts: startTs,
      channel: opts.channel,
      argv: opts.redactArgv ? ['git', '<redacted>'] : argv,
      exitCode: shape.exitCode ?? null,
      stdout: shape.stdout,
      stderr: shape.stderr,
      durationMs: Date.now() - startTs,
      ok: false,
    });
    throw new GitError(shape);
  }

  active.delete(callId);
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const exitCode = result.exitCode;
  const ok = exitCode === 0;

  logStore.push({
    id: callId,
    ts: startTs,
    channel: opts.channel,
    argv: opts.redactArgv ? ['git', '<redacted>'] : argv,
    exitCode: exitCode ?? null,
    stdout,
    stderr,
    durationMs: Date.now() - startTs,
    ok,
  });

  if (!ok && opts.reject !== false) {
    // Caller asked to throw on failure (default). Map common failures to codes.
    const code = classifyFailure(stderr, exitCode ?? 1);
    const shape: GitErrorShape = {
      code,
      message: `git ${opts.args[0] ?? ''} exited ${exitCode}`,
      stdout,
      stderr,
      friendly: friendlyFor(code, stderr),
      command: argv.join(' '),
      exitCode: exitCode ?? undefined,
    };
    throw new GitError(shape);
  }

  return { stdout, stderr, exitCode: exitCode ?? 1, ok };
}

function classifyFailure(stderr: string, _exitCode: number): GitErrorCode {
  const s = stderr.toLowerCase();
  if (s.includes('not a git repository') || s.includes('does not have a commit checked out')) {
    return 'NotARepo';
  }
  if (s.includes('conflict') || s.includes('merge conflict') || s.includes('could not apply')) {
    return 'Conflicts';
  }
  if (s.includes('your local changes') || s.includes('would be overwritten') || s.includes('please commit your changes')) {
    return 'UncommittedChanges';
  }
  if (s.includes('![rejected]') || s.includes('non-fast-forward') || s.includes('failed to push')) {
    return 'Rejected';
  }
  if (_exitCode === 128 && s.includes('not found')) return 'NotSupported';
  return 'GitFailed';
}

function friendlyFor(code: GitErrorCode, stderr: string): string {
  switch (code) {
    case 'NotARepo':
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

function toGitErrorShape(
  err: unknown,
  argv: readonly string[],
  _channel: string,
  code: GitErrorCode,
): GitErrorShape {
  const e = err as { stdout?: string; stderr?: string; exitCode?: number; message?: string };
  return {
    code,
    message: e?.message ?? String(err),
    stdout: e?.stdout ?? '',
    stderr: e?.stderr ?? '',
    friendly: friendlyFor(code, e?.stderr ?? ''),
    command: argv.join(' '),
    exitCode: e?.exitCode,
  };
}

/** Convenience: run git in a repo and return stdout (throwing on failure). */
export async function gitText(opts: Omit<GitRunOptions, 'reject'>): Promise<string> {
  const r = await gitRun({ ...opts, reject: true });
  return r.stdout;
}

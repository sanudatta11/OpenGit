// tests/integration/helpers.ts — shared test helpers for Layer A integration tests.
// Each test file gets its own temp repo; helpers are parameterized by workTree path.

import { execFileSync, type ExecFileSyncOptions } from 'node:child_process';
import { existsSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir, platform } from 'node:os';

// ─────────────────────────────────────────────────────────────────────────────
// TestRepo — paths returned by setupTestRepo()
// ─────────────────────────────────────────────────────────────────────────────

export interface TestRepo {
  root: string;
  main: string;
  remote: string;
  submodule: string;
  worktrees: {
    dashboard: string;
    hotfix: string;
    detached: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture repo setup / teardown
// ─────────────────────────────────────────────────────────────────────────────

/** Options for setupTestRepo */
export interface SetupTestRepoOptions {
  large?: number;
  lfs?: boolean;
}

/**
 * Locate bash on the current platform.
 * On Unix-like systems, bash is typically at /usr/bin/env or in PATH.
 * On Windows, Git for Windows ships bash.exe in <git-root>/bin/ and <git-root>/usr/bin/.
 */
function findBash(): string {
  if (platform() !== 'win32') return 'bash';
  // Git for Windows installs bash.exe relative to the git executable.
  // git --exec-path returns e.g. C:/Program Files/Git/mingw64/libexec/git-core
  // The git root is 3 levels up: C:/Program Files/Git
  try {
    const gitExecPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    // Walk up until we find a directory containing bin/bash.exe or usr/bin/bash.exe
    let dir = gitExecPath;
    for (let i = 0; i < 6; i++) {
      dir = resolve(dir, '..');
      const candidates = [
        resolve(dir, 'bin', 'bash.exe'),
        resolve(dir, 'usr', 'bin', 'bash.exe'),
        resolve(dir, 'bash.exe'),
      ];
      for (const c of candidates) {
        if (existsSync(c)) return c;
      }
      if (dir === resolve(dir, '..')) break; // reached filesystem root
    }
  } catch {
    // fall through
  }
  return 'bash';
}

/**
 * Convert a Windows path to a format that Git Bash can understand.
 * Git Bash accepts Windows paths with forward slashes (e.g. J:/OpenGit/tests/).
 * On non-Windows platforms the path is returned unchanged.
 */
function toBashPath(p: string): string {
  if (platform() !== 'win32') return p;
  // Simply replace backslashes with forward slashes — Git Bash handles
  // C:/Users/... style paths natively without needing MSYS mount mappings.
  return p.replace(/\\/g, '/');
}

/**
 * Create a fully-featured test repository by running setup-test-repo.sh.
 * Calls `resolve(__dirname, 'setup-test-repo.sh')` to find the script.
 * Returns paths to main repo, remote, submodule, and worktrees.
 * Timeout: the script + git init can take several seconds, especially with --large.
 */
export async function setupTestRepo(opts?: SetupTestRepoOptions): Promise<TestRepo> {
  const root = mkdtempSync(join(tmpdir(), 'opengit-int-'));
  const script = resolve(__dirname, 'setup-test-repo.sh');
  const args: string[] = [root];
  if (opts?.large) args.push(`--large=${opts.large}`);
  if (opts?.lfs === false) args.push('--no-lfs');
  const bash = findBash();
  // Git Bash on Windows strips backslashes from paths passed as arguments.
  // Convert all paths to Unix-style forward-slash paths.
  execFileSync(bash, [toBashPath(script), toBashPath(root), ...args.slice(1).map(a => toBashPath(a))], {
    stdio: 'pipe',
    encoding: 'utf8',
    env: { ...process.env, OPENGIT_TEST_ROOT: root },
  });
  return {
    root,
    main: join(root, 'main'),
    remote: join(root, 'remote.git'),
    submodule: join(root, 'submodule-lib'),
    worktrees: {
      dashboard: join(root, 'wt-feature-dashboard'),
      hotfix: join(root, 'wt-hotfix'),
      detached: join(root, 'wt-detached'),
    },
  };
}

/** Remove the entire test repo tree. */
export function cleanupTestRepo(root: string): void {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch {
    // ignore — already gone
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Git helpers
// ─────────────────────────────────────────────────────────────────────────────

const GIT_ENV = {
  ...process.env,
  GIT_PAGER: 'cat',
  LC_ALL: 'C',
  GIT_TERMINAL_PROMPT: '0',
  // Prevent CRLF line-ending conversion on Windows so test assertions
  // that compare file content match regardless of platform.
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: 'core.autocrlf',
  GIT_CONFIG_VALUE_0: 'false',
  GIT_CONFIG_KEY_1: 'protocol.file.allow',
  GIT_CONFIG_VALUE_1: 'always',
} satisfies Record<string, string | undefined>;

const gitExecOpts = (cwd: string): ExecFileSyncOptions => ({
  cwd,
  encoding: 'utf8' as const,
  stdio: ['pipe', 'pipe', 'pipe'] as const,
  env: GIT_ENV,
});

/** Run a git command, throw on non-zero. Returns stdout. */
export function git(workTree: string, args: string[]): string {
  return execFileSync('git', args, gitExecOpts(workTree)).toString();
}

/** Run a git command, capture outcome without throwing. */
export function gitOk(workTree: string, args: string[]): { ok: boolean; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync('git', args, gitExecOpts(workTree)).toString();
    return { ok: true, stdout, stderr: '' };
  } catch (e: unknown) {
    const err = e as { stdout?: Buffer; stderr?: Buffer };
    return {
      ok: false,
      stdout: err.stdout?.toString() ?? '',
      stderr: err.stderr?.toString() ?? '',
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Disk helpers
// ─────────────────────────────────────────────────────────────────────────────

export function writeFile(workTree: string, rel: string, content: string): void {
  writeFileSync(join(workTree, rel), content, 'utf8');
}

export function readFile(workTree: string, rel: string): string {
  return readFileSync(join(workTree, rel), 'utf8');
}

export function exists(workTree: string, rel: string): boolean {
  return existsSync(join(workTree, rel));
}

// ─────────────────────────────────────────────────────────────────────────────
// Repo introspection helpers
// ─────────────────────────────────────────────────────────────────────────────

export function currentBranch(workTree: string): string {
  return git(workTree, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
}

export function headSha(workTree: string): string {
  return git(workTree, ['rev-parse', 'HEAD']).trim();
}

export function logSubjects(workTree: string, n = 10): string[] {
  const out = git(workTree, ['log', `--max-count=${n}`, '--pretty=format:%s']);
  return out.trim() ? out.trim().split('\n') : [];
}

export function branchExists(workTree: string, name: string): boolean {
  const out = git(workTree, ['branch', '--list', name]);
  return out.trim().length > 0;
}

export function remoteRefExists(remoteGit: string, ref: string): boolean {
  try {
    git(remoteGit, ['rev-parse', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

export function hasMergeInProgress(workTree: string): boolean {
  return existsSync(join(workTree, '.git', 'MERGE_HEAD'));
}

export function conflictFiles(workTree: string): string[] {
  const out = git(workTree, ['diff', '--name-only', '--diff-filter=U', '-z']);
  if (!out.trim()) return [];
  return out.trim().split('\0').filter(Boolean);
}

// ─────────────────────────────────────────────────────────────────────────────
// Availability probes for conditional tests
// ─────────────────────────────────────────────────────────────────────────────

export function lfsAvailable(): boolean {
  try {
    execFileSync('git', ['lfs', 'version'], { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

export function gpgAvailable(): boolean {
  try {
    execFileSync('gpg', ['--version'], { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8' });
    // Also check there's a key for test@opengit.dev
    const keys = execFileSync('gpg', ['--batch', '--list-keys', 'test@opengit.dev'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return keys.includes('test@opengit.dev');
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lightweight repo builder (for tests that need a clean slate)
// ─────────────────────────────────────────────────────────────────────────────

/** Quick repo builder props. */
export interface QuickRepo {
  workTree: string;
  gitDir: string;
}

/**
 * Create a temporary bare-minimum repo with 1 initial commit.
 * Faster than setupTestRepo() for tests that need a clean, simple state.
 */
export function createQuickRepo(): QuickRepo {
  const workTree = mkdtempSync(join(tmpdir(), 'opengit-qr-'));
  git(workTree, ['init', '-q', '-b', 'main']);
  git(workTree, ['config', 'user.email', 't@t.co']);
  git(workTree, ['config', 'user.name', 'Test']);
  git(workTree, ['config', 'commit.gpgsign', 'false']);
  writeFileSync(join(workTree, 'base.txt'), 'base\n');
  git(workTree, ['add', '.']);
  git(workTree, ['commit', '-q', '-m', 'initial']);
  return { workTree, gitDir: join(workTree, '.git') };
}

/** Quick repo with 2 branches (main + feature, 1 commit each, diverged after base). */
export function createQuickRepoWithBranch(branchName = 'feature'): QuickRepo & { branch: string } {
  const r = createQuickRepo();
  const { workTree } = r;
  git(workTree, ['checkout', '-q', '-b', branchName]);
  writeFileSync(join(workTree, `${branchName}.txt`), `${branchName}\n`);
  git(workTree, ['add', '.']);
  git(workTree, ['commit', '-q', '-m', `${branchName} commit`]);
  git(workTree, ['checkout', '-q', 'main']);
  return { ...r, branch: branchName };
}

/** Destroy a quick repo. */
export function destroyQuickRepo(qr: QuickRepo): void {
  rmSync(qr.workTree, { recursive: true, force: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Conflict setup — creates two branches that will conflict on base.txt
// ─────────────────────────────────────────────────────────────────────────────

export function setupConflictBranches(workTree: string, branchA = 'side-a', branchB = 'side-b'): void {
  git(workTree, ['checkout', '-q', '-b', branchA]);
  writeFile(workTree, 'base.txt', `${branchA}\n`);
  git(workTree, ['add', '.']);
  git(workTree, ['commit', '-q', '-m', `${branchA} change`]);
  git(workTree, ['checkout', '-q', 'main']);
  git(workTree, ['checkout', '-q', '-b', branchB]);
  writeFile(workTree, 'base.txt', `${branchB}\n`);
  git(workTree, ['add', '.']);
  git(workTree, ['commit', '-q', '-m', `${branchB} change`]);
  git(workTree, ['checkout', '-q', 'main']);
}

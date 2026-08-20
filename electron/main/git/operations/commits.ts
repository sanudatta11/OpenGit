import { join } from 'node:path';
import type { WriteResult } from '@shared/ipc';
import { gitRun, gitText } from '../client';
import { toWriteResult } from './commandResult';
import { probeState } from './state';

export interface CommitOptions {
  message: string;
  amend?: boolean;
  signoff?: boolean;
  noVerify?: boolean;
  author?: { name: string; email: string };
  /** Per-commit signing override. `false` forces --no-gpg-sign. */
  sign?: false | { method: 'gpg' | 'ssh'; key?: string };
}

export async function createCommit(
  workTree: string,
  opts: CommitOptions,
): Promise<WriteResult<{ sha: string }>> {
  const args = ['commit', '-m', opts.message];
  if (opts.amend) args.push('--amend');
  if (opts.signoff) args.push('--signoff');
  if (opts.noVerify) args.push('--no-verify');
  if (opts.author) args.push('--author', `${opts.author.name} <${opts.author.email}>`);

  if (opts.sign === false) {
    args.push('--no-gpg-sign');
  } else if (opts.sign) {
    args.push('-S');
    if (opts.sign.key) {
      args.unshift('-c', `user.signingkey=${opts.sign.key}`);
    }
    args.unshift('-c', `gpg.format=${opts.sign.method === 'ssh' ? 'ssh' : 'openpgp'}`);
    args.unshift('-c', 'commit.gpgsign=true');
  }

  const result = await gitRun({ cwd: workTree, args, channel: 'commit:create', reject: false });
  if (!result.ok) return toWriteResult(result);

  let sha = '';
  try {
    sha = (await gitText({
      cwd: workTree,
      args: ['rev-parse', 'HEAD'],
      channel: 'commit:create',
    })).trim();
  } catch {
    // The commit succeeded; the SHA lookup is best-effort.
  }

  return toWriteResult(result, { data: { sha }, changedRefs: ['HEAD'] });
}

async function runCommitSequence(
  workTree: string,
  command: 'cherry-pick' | 'revert',
  shas: readonly string[],
  noCommit: boolean,
): Promise<WriteResult> {
  const args: string[] = [command];
  if (noCommit) args.push('--no-commit');
  args.push(...shas);
  const result = await gitRun({
    cwd: workTree,
    args,
    channel: command === 'cherry-pick' ? 'commit:cherryPick' : 'commit:revert',
    reject: false,
  });
  const hasConflicts = /CONFLICT|could not apply|Merge conflict/i.test(
    `${result.stderr}\n${result.stdout}`,
  );
  return toWriteResult(result, {
    changedRefs: (ok) => ok ? ['HEAD'] : [],
    requiresRefresh: true,
    state: hasConflicts ? await probeState(workTree, join(workTree, '.git')) : undefined,
  });
}

export function cherryPick(
  workTree: string,
  shas: readonly string[],
  noCommit: boolean,
): Promise<WriteResult> {
  return runCommitSequence(workTree, 'cherry-pick', shas, noCommit);
}

export function revertCommits(
  workTree: string,
  shas: readonly string[],
  noCommit: boolean,
): Promise<WriteResult> {
  return runCommitSequence(workTree, 'revert', shas, noCommit);
}

export async function verifyCommit(
  workTree: string,
  sha: string,
): Promise<{ verified: boolean; signer: string }> {
  const result = await gitRun({
    cwd: workTree,
    args: ['verify-commit', sha],
    channel: 'commit:verify',
    reject: false,
  });
  const signerMatch = result.stderr.match(/Good signature from "(.+)"/) ??
    result.stdout.match(/Good signature from "(.+)"/);
  return { verified: result.ok, signer: signerMatch?.[1] ?? '' };
}

export interface BlameEntry {
  sha: string;
  author: string;
  authorEmail: string;
  authorDate: string;
  line: number;
  content: string;
}

export async function getBlame(
  workTree: string,
  path: string,
  ref?: string,
): Promise<BlameEntry[]> {
  const args = ['blame', '--porcelain'];
  if (ref) args.push(ref);
  args.push('--', path);
  const result = await gitRun({ cwd: workTree, args, channel: 'diff:blame', reject: false });
  if (!result.ok) return [];

  const lines = result.stdout.split('\n');
  const entries: BlameEntry[] = [];
  let currentSha = '';
  let currentAuthor = '';
  let currentAuthorEmail = '';
  let currentAuthorDate = '';
  let currentLineNo = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const commitMatch = line.match(/^(\^?[0-9a-f]{40})\s+(\d+)\s+(\d+)(?:\s+(\d+))?/);
    if (commitMatch) {
      currentSha = commitMatch[1]!.replace(/^\^/, '');
      currentLineNo = Number.parseInt(commitMatch[3]!, 10);
      while (i + 1 < lines.length) {
        const peek = lines[i + 1];
        if (!peek || /^(\^?[0-9a-f]{40})\s/.test(peek) || peek.startsWith('\t')) break;
        i++;
        if (peek.startsWith('author ')) currentAuthor = peek.slice(7);
        else if (peek.startsWith('author-mail ')) {
          currentAuthorEmail = peek.slice(12).replace(/[<>]/g, '');
        } else if (peek.startsWith('author-time ')) currentAuthorDate = peek.slice(12);
      }
      continue;
    }
    if (line.startsWith('\t')) {
      entries.push({
        sha: currentSha,
        author: currentAuthor,
        authorEmail: currentAuthorEmail,
        authorDate: currentAuthorDate,
        line: currentLineNo++,
        content: line.slice(1),
      });
    }
  }
  return entries;
}

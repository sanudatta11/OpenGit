// electron/main/git/parse/branches.ts — parse `git for-each-ref` + tag HEAD detection.
// Returns branches + a map of sha → RefLabel[] for the log parser to attach.

import type { Branch, RefKind, RefLabel, TrackInfo } from '@shared/git';

export interface ParsedBranches {
  branches: Branch[];
  refsBySha: Map<string, RefLabel[]>;
  currentHeadSha: string | null;
}

export function parseBranches(
  raw: string,
  headRef: string | null,    // "ref: refs/heads/main" from .git/HEAD, or null for detached
  headSha: string | null,    // sha when detached, else null
): ParsedBranches {
  const records = raw.split('\n').filter((r) => r.length > 0);
  const branches: Branch[] = [];
  const refsBySha = new Map<string, RefLabel[]>();
  let currentHeadSha: string | null = null;

  const currentRef = headRef?.startsWith('ref: ') ? headRef.slice(5) : null;

  for (const rec of records) {
    const fields = rec.split('\x1f');
    if (fields.length < 6) continue;
    const [refname, sha, upstream, trackStr, headMark, date] = fields;
    if (!refname || !sha || !date) continue;

    const kind = refKindFor(refname);
    const shortName = shortNameFor(refname, kind);
    const isHead = headMark === '*';
    const upstreamTrack = parseTrack(trackStr ?? '');

    if (isHead) currentHeadSha = sha;

    branches.push({
      kind,
      name: refname,
      shortName,
      sha,
      upstream: upstream && upstream.length > 0 ? upstream : null,
      upstreamTrack,
      isHead,
      date,
    });

    const label: RefLabel = { kind, shortName, isHead };
    const existing = refsBySha.get(sha);
    if (existing) existing.push(label);
    else refsBySha.set(sha, [label]);
  }

  // For detached HEAD, attach a HEAD label to the checked-out commit.
  if (!currentRef && headSha) {
    currentHeadSha = headSha;
    const label: RefLabel = { kind: 'HEAD', shortName: 'HEAD', isHead: true };
    const existing = refsBySha.get(headSha);
    if (existing) {
      existing.unshift(label);
    } else {
      refsBySha.set(headSha, [label]);
    }
  }

  return { branches, refsBySha, currentHeadSha };
}

function refKindFor(refname: string): RefKind {
  if (refname.startsWith('refs/heads/')) return 'local';
  if (refname.startsWith('refs/remotes/')) return 'remote';
  if (refname.startsWith('refs/tags/')) return 'tag';
  return 'local';
}

function shortNameFor(refname: string, kind: RefKind): string {
  if (kind === 'local') return refname.slice('refs/heads/'.length);
  if (kind === 'remote') return refname.slice('refs/remotes/'.length); // origin/main
  if (kind === 'tag') return refname.slice('refs/tags/'.length);
  return refname;
}

function parseTrack(s: string): TrackInfo | null {
  if (!s || s === '') return null;
  const trimmed = s.replace(/^\[|\]$/g, '').trim();
  if (trimmed === 'gone') return { ahead: 0, behind: 0, gone: true };
  const aheadM = trimmed.match(/ahead (\d+)/);
  const behindM = trimmed.match(/behind (\d+)/);
  return {
    ahead: aheadM ? Number(aheadM[1]) : 0,
    behind: behindM ? Number(behindM[1]) : 0,
    gone: false,
  };
}

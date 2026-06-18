// electron/main/git/parse/log.ts — parse git log --pretty=format with custom separators.
// Output: commits newest → oldest. lane/parentLanes are NOT set here (graph renderer does that).

import type { Commit, Person, RefLabel } from '@shared/git';

// Field separators: %x1f (unit separator) between fields.
const FS = '\x1f';

// Format string passed to git. Order matters — must match the parser.
// %H  sha
// %P  parent shas (space-separated; empty for root)
// %an author name
// %ae author email
// %aI author date ISO-8601
// %cn committer name
// %ce committer email
// %cI committer date ISO-8601
// %s  subject
// %b  body
export const LOG_FORMAT = [
  '%H', '%P', '%an', '%ae', '%aI', '%cn', '%ce', '%cI', '%s', '%b',
].join(FS);

export interface ParsedLog {
  commits: Commit[];
  hasMore: boolean;
}

/**
 * Parse raw log output. Caller should pass `-z` so records are NUL-separated
 * (and so paths/multiline bodies work).
 *
 * @param raw stdout from `git log --pretty=format:... -z ...`
 * @param refsBySha map of sha → RefLabel[] (precomputed by branch parser). If absent, refs=[].
 * @param expectedCount how many commits were requested; if more returned, hasMore=true.
 */
export function parseLog(
  raw: string,
  refsBySha?: ReadonlyMap<string, RefLabel[]>,
  expectedCount?: number,
): ParsedLog {
  const records = raw.split('\0').filter((r) => r.length > 0);
  const commits: Commit[] = [];

  for (const rec of records) {
    // Body (%b) can be multiline; it's the last field, so everything after the 9th FS is body.
    const fields = rec.split(FS);
    if (fields.length < 9) continue; // malformed — skip

    const [sha, parents, an, ae, aI, cn, ce, cI, s] = fields;
    const body = fields.slice(9).join(FS);

    const author: Person = { name: an!, email: ae!, date: aI! };
    const committer: Person = { name: cn!, email: ce!, date: cI! };

    const parentList = parents!.length > 0 ? parents!.split(' ') : [];

    commits.push({
      sha: sha!,
      parents: parentList,
      author,
      committer,
      subject: s!,
      body,
      refs: refsBySha?.get(sha!) ?? [],
      lane: -1,         // assigned by graph renderer
      parentLanes: [],  // assigned by graph renderer
    });
  }

  const hasMore = expectedCount != null && commits.length >= expectedCount;
  return { commits, hasMore };
}

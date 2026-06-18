// electron/main/git/parse/stash.ts — parse `git stash list` and `git stash show`.

import type { StashEntry } from '@shared/git';

// Format: %gd%x1f%H%x1f%s%x1f%ci
// %gd = stash ref selector (stash@{0})
// %H  = commit sha
// %s  = subject (WIP on branch: sha message)
// %ci = committer date ISO-strict
const FS = '\x1f';

export const STASH_LIST_FORMAT = ['%gd', '%H', '%s', '%ci'].join(FS);

export function parseStashList(raw: string): StashEntry[] {
  const lines = raw.split('\n').filter((l) => l.length > 0);
  const entries: StashEntry[] = [];

  for (const line of lines) {
    const fields = line.split(FS);
    if (fields.length < 4) continue;
    const [ref, sha, subject, date] = fields;
    if (!ref || !sha || !subject || !date) continue;

    // Parse "WIP on branchname: abc1234 subject" or "On branchname: abc1234 subject"
    const branchMatch = subject.match(/^(?:WIP|On) (\S[^:]*):/);
    const branch = branchMatch ? branchMatch[1]! : null;

    entries.push({
      ref,
      sha,
      subject,
      date,
      branch,
      indexSha: null,    // filled on demand by `git stash show`
      untrackedSha: null,
    });
  }

  return entries;
}

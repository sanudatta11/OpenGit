// electron/main/git/parse/remotes.ts — parse `git remote -v`.

import type { RemoteInfo } from '@shared/git';

export function parseRemotes(raw: string): RemoteInfo[] {
  const byName = new Map<string, RemoteInfo>();

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    // "origin\tgit@github.com:foo/bar.git (fetch)"
    const tab = line.indexOf('\t');
    if (tab === -1) continue;
    const name = line.slice(0, tab);
    const rest = line.slice(tab + 1);
    const paren = rest.lastIndexOf(' (');
    if (paren === -1) continue;
    const url = rest.slice(0, paren);
    const kind = rest.slice(paren + 2, -1); // "fetch" or "push"

    const existing = byName.get(name);
    if (existing) {
      if (kind === 'fetch') byName.set(name, { ...existing, fetchUrl: url });
      else byName.set(name, { ...existing, pushUrl: url });
    } else {
      byName.set(name, {
        name,
        fetchUrl: kind === 'fetch' ? url : null,
        pushUrl: kind === 'push' ? url : null,
      });
    }
  }

  return [...byName.values()];
}

import type { StatusEntry } from '@shared/git';

export type CommitPanelSort = 'asc' | 'desc';
export type CommitPanelView = 'path' | 'tree';
export type FileListContext = 'staged' | 'unstaged';

export type PathTreeNode =
  | { kind: 'folder'; name: string; path: string; children: PathTreeNode[] }
  | { kind: 'file'; name: string; path: string; entry: StatusEntry };

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function normalizeGitPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function comparePaths(a: string, b: string, direction: CommitPanelSort): number {
  const result = collator.compare(normalizeGitPath(a), normalizeGitPath(b));
  return direction === 'asc' ? result : -result;
}

interface MutableFolder {
  name: string;
  path: string;
  folders: Map<string, MutableFolder>;
  files: Array<{ name: string; path: string; entry: StatusEntry }>;
}

function materializeFolder(folder: MutableFolder, direction: CommitPanelSort): PathTreeNode[] {
  const folders = [...folder.folders.values()]
    .sort((a, b) => comparePaths(a.name, b.name, direction))
    .map<PathTreeNode>((child) => ({
      kind: 'folder',
      name: child.name,
      path: child.path,
      children: materializeFolder(child, direction),
    }));
  const files = [...folder.files]
    .sort((a, b) => comparePaths(a.name, b.name, direction))
    .map<PathTreeNode>((file) => ({ kind: 'file', ...file }));
  return [...folders, ...files];
}

export function buildPathTree(entries: readonly StatusEntry[], direction: CommitPanelSort): PathTreeNode[] {
  const root: MutableFolder = { name: '', path: '', folders: new Map(), files: [] };

  for (const entry of entries) {
    const normalized = normalizeGitPath(entry.path);
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length === 0) continue;
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${part}` : part;
      let child = folder.folders.get(part);
      if (!child) {
        child = { name: part, path, folders: new Map(), files: [] };
        folder.folders.set(part, child);
      }
      folder = child;
    }
    folder.files.push({ name: parts.at(-1)!, path: normalized, entry });
  }

  return materializeFolder(root, direction);
}

export function summarizeWip(entries: readonly StatusEntry[]): {
  files: number;
  additions: number;
  modifications: number;
} {
  const unique = new Map<string, StatusEntry>();
  for (const entry of entries) unique.set(normalizeGitPath(entry.path), entry);
  let additions = 0;
  let modifications = 0;
  for (const entry of unique.values()) {
    if (entry.kind === 'added' || entry.kind === 'untracked') additions += 1;
    else modifications += 1;
  }
  return { files: unique.size, additions, modifications };
}

export function getFileActionEligibility(entry: StatusEntry, context: FileListContext): {
  canStage: boolean;
  canUnstage: boolean;
  canDiscard: boolean;
} {
  return context === 'unstaged'
    ? { canStage: entry.unstaged, canUnstage: false, canDiscard: entry.unstaged || entry.kind === 'untracked' }
    : { canStage: false, canUnstage: entry.staged, canDiscard: false };
}

export function buildCommitMessage(summary: string, description: string): string {
  const trimmedSummary = summary.trim();
  const trimmedDescription = description.trim();
  if (!trimmedDescription) return trimmedSummary;
  return `${trimmedSummary}\n\n${trimmedDescription}`;
}

export function canCreateCommit(input: {
  summary: string;
  stagedCount: number;
  amend: boolean;
  hasConflicts: boolean;
  pending: boolean;
}): boolean {
  return !!input.summary.trim()
    && !input.hasConflicts
    && !input.pending
    && (input.stagedCount > 0 || input.amend);
}

export function resolvePushTarget(branch: { shortName: string; upstream: string | null }): {
  remote: string;
  branch: string;
  setUpstream: boolean;
} {
  const parts = branch.upstream?.split('/') ?? [];
  return {
    remote: parts[0] || 'origin',
    branch: parts.length > 1 ? parts.slice(1).join('/') : branch.shortName,
    setUpstream: !branch.upstream,
  };
}

// src/components/compare/BranchCompare.tsx — compare two branches (ahead/behind commits + files).

import { useState } from 'react';
import { ArrowUp, ArrowDown, GitCompare } from 'lucide-react';
import { useBranches, useBranchCompare } from '../../queries/useRepo';
import { useRepoStore } from '../../stores/repo';

export function BranchCompare() {
  const branchesQ = useBranches();
  const repoStoreBranch = useRepoStore((s) => {
    if (!s.repo) return null;
    return s.repo.currentBranch;
  });

  const localBranches = (branchesQ.data ?? []).filter((b) => b.kind === 'local');
  const defaultBranchA = localBranches.length > 1 ? localBranches[1]!.shortName : '';
  const defaultBranchB = repoStoreBranch ?? '';

  const [branchA, setBranchA] = useState(defaultBranchA);
  const [branchB, setBranchB] = useState(defaultBranchB);

  const compare = useBranchCompare(branchA || null, branchB || null);

  const result = compare.data;

  return (
    <div className="flex flex-col min-h-0 text-xs">
      {/* Branch selectors */}
      <div className="p-3 border-b border-border space-y-2 shrink-0">
        <div className="flex items-center gap-2">
          <label className="label w-12 shrink-0">From</label>
          <select
            className="input flex-1 text-xs"
            value={branchA}
            onChange={(e) => setBranchA(e.target.value)}
          >
            {localBranches.map((b) => (
              <option key={b.name} value={b.shortName}>{b.shortName}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="label w-12 shrink-0">To</label>
          <select
            className="input flex-1 text-xs"
            value={branchB}
            onChange={(e) => setBranchB(e.target.value)}
          >
            {localBranches.map((b) => (
              <option key={b.name} value={b.shortName}>{b.shortName}</option>
            ))}
          </select>
        </div>
      </div>

      {compare.isLoading && (
        <div className="p-4 text-center text-fg-muted">Comparing branches…</div>
      )}

      {compare.error && (
        <div className="p-4 text-center text-git-deleted">{(compare.error as Error).message}</div>
      )}

      {result && (
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          {/* Metrics bar */}
          <div className="px-3 py-2 border-b border-border flex items-center gap-4 shrink-0">
            <span className="text-git-added font-medium flex items-center gap-1">
              <ArrowUp className="w-3.5 h-3.5" />
              +{result.aheadCount} ahead
            </span>
            <span className="text-git-deleted font-medium flex items-center gap-1">
              <ArrowDown className="w-3.5 h-3.5" />
              -{result.behindCount} behind
            </span>
          </div>

          {/* Ahead commits */}
          {result.aheadCommits.length > 0 && (
            <Section title={`AHEAD (${result.aheadCommits.length})`} defaultOpen>
              {result.aheadCommits.map((c) => (
                <CommitRow key={c.sha} sha={c.sha} author={c.author} subject={c.subject} />
              ))}
            </Section>
          )}

          {/* Behind commits */}
          {result.behindCommits.length > 0 && (
            <Section title={`BEHIND (${result.behindCommits.length})`} defaultOpen>
              {result.behindCommits.map((c) => (
                <CommitRow key={c.sha} sha={c.sha} author={c.author} subject={c.subject} />
              ))}
            </Section>
          )}

          {/* Changed files */}
          {result.files.length > 0 && (
            <Section title={`CHANGED FILES (${result.files.length})`} defaultOpen>
              {result.files.map((f) => (
                <FileRow key={f.path} file={f} />
              ))}
            </Section>
          )}

          {result.aheadCommits.length === 0 && result.behindCommits.length === 0 && result.files.length === 0 && (
            <div className="p-4 text-center text-fg-dim">Branches are identical.</div>
          )}
        </div>
      )}

      {!compare.isLoading && !compare.error && !result && (
        <div className="p-4 text-center text-fg-dim flex flex-col items-center gap-2">
          <GitCompare className="w-8 h-8 text-fg-dim" />
          <span>Select two branches to compare.</span>
        </div>
      )}
    </div>
  );
}

function Section({ title, defaultOpen, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  return (
    <div className="border-b border-border-subtle/30">
      <button
        className="w-full px-3 py-1.5 label flex items-center justify-between sticky top-0 bg-bg-panel z-10 hover:bg-bg-hover/30"
        onClick={() => setOpen(!open)}
      >
        <span>{title}</span>
        <span className={`text-fg-dim transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
      </button>
      {open && children}
    </div>
  );
}

function CommitRow({ sha, author, subject }: { sha: string; author: string; subject: string }) {
  const selectCommit = useRepoStore((s) => s.selectCommit);
  return (
    <button
      className="w-full text-left px-3 py-1 row-hover flex items-start gap-2 border-b border-border-subtle/20"
      onClick={() => selectCommit(sha)}
      title={subject}
    >
      <span className="font-mono text-fg-muted shrink-0 mt-0.5">{sha.slice(0, 7)}</span>
      <span className="text-fg truncate leading-tight flex-1">{subject}</span>
      <span className="text-fg-dim shrink-0 text-xxs mt-0.5">{author}</span>
    </button>
  );
}

function FileRow({ file }: { file: import('@shared/ipc').BranchCompareFile }) {
  const selectFile = useRepoStore((s) => s.selectFile);
  const statusColor = {
    added: 'bg-git-added/20 text-git-added',
    modified: 'bg-git-modified/20 text-git-modified',
    deleted: 'bg-git-deleted/20 text-git-deleted',
    renamed: 'bg-git-conflicted/20 text-git-conflicted',
    copied: 'bg-accent/20 text-accent',
  }[file.status];

  const statusLabel = {
    added: 'A',
    modified: 'M',
    deleted: 'D',
    renamed: 'R',
    copied: 'C',
  }[file.status];

  const label = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;

  return (
    <button
      className="w-full text-left px-3 py-1 row-hover flex items-center gap-2 border-b border-border-subtle/20"
      onClick={() => selectFile({ path: file.path, staged: false, isCommit: false, oldPath: file.oldPath })}
      title={file.path}
    >
      <span className={`text-xxs font-mono font-bold px-1.5 py-0.5 rounded ${statusColor} shrink-0`}>
        {statusLabel}
      </span>
      <span className="text-xs font-mono truncate flex-1">{label}</span>
      <span className="text-xxs shrink-0 flex items-center gap-1.5">
        {file.additions > 0 && <span className="text-git-added">+{file.additions}</span>}
        {file.deletions > 0 && <span className="text-git-deleted">-{file.deletions}</span>}
      </span>
    </button>
  );
}

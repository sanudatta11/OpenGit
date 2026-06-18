// src/components/inspector/Inspector.tsx — right pane: commit details or working-tree editor.

import { useRepoStore, getCachedCommit } from '../../stores/repo';
import { useStatus } from '../../queries/useRepo';
import { CommitDetails } from './CommitDetails';
import { WorkingTree } from './WorkingTree';

export function Inspector() {
  const selectedSha = useRepoStore((s) => s.selectedCommitSha);
  const status = useStatus();
  const dirty = !status.data?.isClean;
  const commit = selectedSha ? getCachedCommit(selectedSha) : undefined;

  // If working tree is dirty and nothing is selected, default to working tree view.
  if (dirty && !selectedSha) {
    return (
      <div className="w-[420px] border-l border-border bg-bg-panel shrink-0 flex flex-col min-h-0">
        <WorkingTree />
      </div>
    );
  }

  return (
    <div className="w-[420px] border-l border-border bg-bg-panel shrink-0 flex flex-col min-h-0">
      {commit ? <CommitDetails commit={commit} /> : <WorkingTree />}
    </div>
  );
}

import { Sparkles, Trash2 } from 'lucide-react';
import type { StatusEntry } from '@shared/git';
import { useDiscardAllUnstaged } from '../../queries/useMutations';
import { ConfirmDialog } from '../ConfirmDialog';
import { useState } from 'react';
import { summarizeWip } from './model';

export function CommitPanelHeader({ entries, branch }: { entries: readonly StatusEntry[]; branch: string | null }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const discardAll = useDiscardAllUnstaged();
  const summary = summarizeWip(entries);
  const tracked = entries.filter((entry) => entry.unstaged && entry.kind !== 'untracked' && entry.kind !== 'unmerged').length;
  const untracked = entries.filter((entry) => entry.kind === 'untracked').length;
  const canDiscard = tracked + untracked > 0;

  return (
    <>
      <header id="commit-sidebar-header" tabIndex={-1} className="commit-panel-header">
        <button
          className="commit-discard-all"
          title={canDiscard ? 'Discard all unstaged changes' : 'No unstaged changes'}
          aria-label="Discard all unstaged changes"
          disabled={!canDiscard || discardAll.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1 flex items-center justify-center gap-1.5 text-xs text-fg-muted">
          <span className="truncate">{summary.files} file change{summary.files === 1 ? '' : 's'} on</span>
          <span className="commit-branch-badge">{branch || 'HEAD'}</span>
        </div>
        <button className="commit-ai-button" aria-label="Generate commit text with AI" title="AI provider not configured" disabled>
          <Sparkles className="w-4 h-4" />
        </button>
      </header>
      <ConfirmDialog
        open={confirmOpen}
        title="Discard all unstaged changes?"
        message={`${tracked} tracked change${tracked === 1 ? '' : 's'} will be restored from the index.${untracked > 0 ? ` ${untracked} untracked file${untracked === 1 ? '' : 's'} will be permanently deleted.` : ''} Staged content will be preserved.`}
        confirmLabel="Discard all"
        danger
        onConfirm={() => {
          discardAll.mutate();
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

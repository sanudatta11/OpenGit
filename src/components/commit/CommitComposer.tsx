import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, MoreHorizontal, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import { useBranches, useLog } from '../../queries/useRepo';
import { useCommit, usePush } from '../../queries/useMutations';
import { useRepoStore } from '../../stores/repo';
import { buildCommitMessage, canCreateCommit, resolvePushTarget } from './model';

export type CommitGenerationState =
  | { status: 'unavailable'; reason: string }
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'error'; message: string };

export interface CommitTextGenerator {
  state: CommitGenerationState;
  generate(entries: readonly string[]): Promise<{ summary: string; description: string }>;
  cancel(): void;
}

const unavailableGenerator: CommitTextGenerator = {
  state: { status: 'unavailable', reason: 'AI provider not configured' },
  async generate() { throw new Error('AI provider not configured'); },
  cancel() {},
};

export function CommitComposer({
  stagedCount,
  hasConflicts,
  generator = unavailableGenerator,
}: {
  stagedCount: number;
  hasConflicts: boolean;
  generator?: CommitTextGenerator;
}) {
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [amend, setAmend] = useState(false);
  const [noVerify, setNoVerify] = useState(false);
  const [signoff, setSignoff] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [pushMenuOpen, setPushMenuOpen] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const draftRef = useRef({ summary: '', description: '' });
  const loadedAmendShaRef = useRef<string | null>(null);
  const commit = useCommit();
  const push = usePush();
  const branches = useBranches();
  const head = useLog(undefined, 0, 1);
  const showGraph = useRepoStore((state) => state.showGraph);
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api.settings.get() });
  const maxSubject = settings.data?.commitSubjectLength ?? 72;
  const headCommit = head.data?.commits[0];

  useEffect(() => {
    if (!amend || !headCommit || loadedAmendShaRef.current === headCommit.sha) return;
    setSummary(headCommit.subject);
    setDescription(headCommit.body);
    loadedAmendShaRef.current = headCommit.sha;
  }, [amend, headCommit]);

  const canCommit = canCreateCommit({
    summary,
    stagedCount,
    amend,
    hasConflicts,
    pending: commit.isPending || push.isPending,
  });

  const setAmendMode = (checked: boolean) => {
    setAmend(checked);
    if (checked) {
      draftRef.current = { summary, description };
      if (headCommit) {
        setSummary(headCommit.subject);
        setDescription(headCommit.body);
        loadedAmendShaRef.current = headCommit.sha;
      }
    } else {
      setSummary(draftRef.current.summary);
      setDescription(draftRef.current.description);
      loadedAmendShaRef.current = null;
    }
  };

  const resetComposer = () => {
    setSummary('');
    setDescription('');
    setAmend(false);
    setNoVerify(false);
    setSignoff(false);
    setOptionsOpen(false);
    setPushMenuOpen(false);
    draftRef.current = { summary: '', description: '' };
    loadedAmendShaRef.current = null;
  };

  const submit = async (pushAfterCommit: boolean) => {
    if (!canCommit) return;
    setFailure(null);
    let result;
    try {
      result = await commit.mutateAsync({
        message: buildCommitMessage(summary, description),
        amend,
        noVerify,
        signoff,
      });
    } catch {
      return;
    }
    if (!result.success) {
      setFailure(result.stderr || result.stdout || 'Commit failed.');
      return;
    }
    resetComposer();
    showGraph();

    if (pushAfterCommit) {
      const branch = branches.data?.find((candidate) => candidate.isHead);
      if (!branch) return;
      try {
        await push.mutateAsync(resolvePushTarget(branch));
      } catch {
        // The push hook owns error presentation and recovery state.
      }
    }
  };

  return (
    <div className="commit-composer">
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
          <input type="checkbox" checked={amend} onChange={(event) => setAmendMode(event.target.checked)} className="accent-accent" />
          Amend previous commit
        </label>
        {amend && headCommit && <span className="font-mono text-[10px] text-fg-dim">{headCommit.sha.slice(0, 7)}</span>}
      </div>

      <div className="relative mt-2">
        <input
          className="commit-summary-input"
          placeholder="Commit summary"
          value={summary}
          onChange={(event) => setSummary(event.target.value)}
          disabled={commit.isPending}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              void submit(false);
            }
          }}
        />
        <button className="commit-input-ai" aria-label="Generate commit summary with AI" title={generator.state.status === 'unavailable' ? generator.state.reason : 'Generate summary'} disabled>
          <Sparkles className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className={`mt-1 text-right text-[10px] ${summary.length > maxSubject ? 'text-git-deleted font-semibold' : 'text-fg-dim'}`}>
        {summary.length}/{maxSubject}
      </div>

      <textarea
        className="commit-description-input"
        placeholder="Description"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        disabled={commit.isPending}
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            void submit(false);
          }
        }}
      />

      {hasConflicts && <p className="mt-1.5 text-[11px] text-git-conflicted">Resolve conflicts before committing.</p>}
      {commit.error && <p className="mt-1.5 text-[11px] text-git-deleted">{(commit.error as Error).message}</p>}
      {failure && <p className="mt-1.5 text-[11px] text-git-deleted">{failure}</p>}

      <div className="mt-2 flex items-center gap-2 relative">
        <button className="icon-btn !w-8 !h-8" title="Commit options" aria-expanded={optionsOpen} onClick={() => setOptionsOpen((open) => !open)}>
          <MoreHorizontal className="w-4 h-4" />
        </button>
        <div className="ml-auto inline-flex relative">
          <button className="btn btn-primary !rounded-r-none !px-4 !py-1.5" disabled={!canCommit} onClick={() => void submit(false)}>
            {(commit.isPending || push.isPending) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Commit
          </button>
          <button className="btn btn-primary !rounded-l-none !border-l-bg/30 !px-2 !py-1.5" disabled={!canCommit} title="More commit actions" onClick={() => setPushMenuOpen((open) => !open)}>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {pushMenuOpen && (
            <div className="absolute bottom-full right-0 mb-1 w-40 rounded-md border border-border bg-bg-elevated shadow-xl p-1 z-30">
              <button className="w-full rounded px-2 py-1.5 text-left text-xs text-fg hover:bg-bg-hover" onClick={() => void submit(true)}>
                Commit &amp; Push
              </button>
            </div>
          )}
        </div>
        {optionsOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-48 rounded-md border border-border bg-bg-elevated shadow-xl p-2 z-30 space-y-2">
            <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
              <input type="checkbox" checked={noVerify} onChange={(event) => setNoVerify(event.target.checked)} className="accent-accent" />
              Skip Git hooks
            </label>
            <label className="flex items-center gap-2 text-xs text-fg-muted cursor-pointer">
              <input type="checkbox" checked={signoff} onChange={(event) => setSignoff(event.target.checked)} className="accent-accent" />
              Add signed-off-by
            </label>
          </div>
        )}
      </div>
    </div>
  );
}

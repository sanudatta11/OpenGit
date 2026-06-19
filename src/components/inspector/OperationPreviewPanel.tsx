// src/components/inspector/OperationPreviewPanel.tsx — Operation previews for merge, pull, push, rebase.

import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import { useBranches, useRemotes } from '../../queries/useRepo';
import { useMerge, useRebase, usePull, usePush } from '../../queries/useMutations';
import { ArrowDown, ArrowUp, GitMerge, GitPullRequest, AlertTriangle, Loader2 } from 'lucide-react';
import type { MergePreview, PullPreview, PushPreview, RebasePlan, RemotePullInput } from '@shared/ipc';
import { useRebaseStore } from '../../stores/rebase';
import { useToastStore } from '../../stores/toast';

type OpType = 'merge' | 'pull' | 'push' | 'rebase';

export function OperationPreviewPanel() {
  const qc = useQueryClient();
  const branches = useBranches();
  const remotes = useRemotes();

  const [op, setOp] = useState<OpType>('merge');
  const [targetBranch, setTargetBranch] = useState('');
  const [remoteName, setRemoteName] = useState('origin');
  
  // Mutations
  const mergeMutation = useMerge();
  const rebaseMutation = useRebase();
  const pullMutation = usePull();
  const pushMutation = usePush();

  // Local options
  const [mergeStrategy, setMergeStrategy] = useState<'recommended' | 'no-ff' | 'squash'>('recommended');
  const [pullStrategy, setPullStrategy] = useState<'merge' | 'rebase' | 'ff-only'>('merge');
  const [pushForce, setPushForce] = useState(false);

  const localBranches = branches.data?.filter((b) => b.kind === 'local') ?? [];
  const currentBranch = branches.data?.find((b) => b.isHead)?.shortName ?? '';

  // Initialize target branch to first local branch that is not current
  useEffect(() => {
    if (localBranches.length > 0 && !targetBranch) {
      const other = localBranches.find((b) => !b.isHead);
      if (other) setTargetBranch(other.shortName);
      else setTargetBranch(localBranches[0]?.shortName ?? '');
    }
  }, [localBranches, targetBranch]);

  // Previews Queries
  const mergePreviewQuery = useQuery({
    queryKey: ['mergePreview', targetBranch],
    queryFn: () => api.operations.mergePreview({ ref: targetBranch }),
    enabled: op === 'merge' && !!targetBranch,
    refetchOnWindowFocus: false,
    staleTime: 5000,
  });

  const pullPreviewQuery = useQuery({
    queryKey: ['pullPreview', remoteName],
    queryFn: () => api.operations.pullPreview({ remote: remoteName }),
    enabled: op === 'pull' && !!remoteName,
    refetchOnWindowFocus: false,
    staleTime: 5000,
  });

  const pushPreviewQuery = useQuery({
    queryKey: ['pushPreview', remoteName],
    queryFn: () => api.operations.pushPreview({ remote: remoteName }),
    enabled: op === 'push' && !!remoteName,
    refetchOnWindowFocus: false,
    staleTime: 5000,
  });

  const rebasePlanQuery = useQuery({
    queryKey: ['rebasePlan', targetBranch],
    queryFn: () => api.operations.rebasePlan({ onto: targetBranch }),
    enabled: op === 'rebase' && !!targetBranch,
    refetchOnWindowFocus: false,
    staleTime: 5000,
  });

  // Automatically update pull strategy based on recommendation
  useEffect(() => {
    if (pullPreviewQuery.data?.recommendedStrategy) {
      setPullStrategy(pullPreviewQuery.data.recommendedStrategy);
    }
  }, [pullPreviewQuery.data]);

  const handleExecute = async () => {
    if (op === 'merge') {
      await mergeMutation.mutateAsync({
        ref: targetBranch,
        noFf: mergeStrategy === 'no-ff',
        squash: mergeStrategy === 'squash',
      });
    } else if (op === 'rebase') {
      await rebaseMutation.mutateAsync({
        onto: targetBranch,
      });
    } else if (op === 'pull') {
      await pullMutation.mutateAsync({
        remote: remoteName,
        strategy: pullStrategy,
        ffOnly: pullStrategy === 'ff-only',
      } as unknown as RemotePullInput);
    } else if (op === 'push') {
      await pushMutation.mutateAsync({
        remote: remoteName,
        forceWithLease: pushForce,
      });
    }
    void qc.invalidateQueries();
  };

  const handleInteractiveRebase = async () => {
    try {
      const plan = await api.rebaseInteractive.plan({ onto: targetBranch });
      useRebaseStore.getState().setActive(plan.onto, plan.currentBranch, [...plan.items]);
    } catch (err) {
      useToastStore.getState().addToast(`Interactive rebase failed: ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const isPending = mergeMutation.isPending || rebaseMutation.isPending || pullMutation.isPending || pushMutation.isPending;

  return (
    <div className="flex-1 flex flex-col min-h-0 text-xs text-fg">
      {/* Op Switcher */}
      <div className="flex border-b border-border bg-bg/10 p-1 shrink-0">
        {(['merge', 'pull', 'push', 'rebase'] as OpType[]).map((type) => (
          <button
            key={type}
            className={`flex-1 py-1 rounded text-xxs capitalize transition-colors ${op === type ? 'bg-accent text-white font-semibold' : 'text-fg-muted hover:bg-bg-hover'}`}
            onClick={() => setOp(type)}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* CONFIG SECTION */}
        {op === 'merge' && (
          <div className="space-y-2">
            <label className="block">
              <span className="label block mb-1">Merge Into: <span className="text-fg font-semibold">{currentBranch}</span></span>
              <select
                className="input w-full"
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
              >
                {localBranches.map((b) => (
                  <option key={b.name} value={b.shortName}>
                    {b.shortName} {b.isHead ? '(current)' : ''}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-1">
              <span className="label block">Merge Options</span>
              <div className="flex gap-2">
                {(['recommended', 'no-ff', 'squash'] as const).map((strat) => (
                  <label key={strat} className="flex items-center gap-1.5 cursor-pointer text-fg-muted hover:text-fg">
                    <input
                      type="radio"
                      name="mergeStrat"
                      checked={mergeStrategy === strat}
                      onChange={() => setMergeStrategy(strat)}
                      className="accent-accent"
                    />
                    <span className="capitalize text-xxs">{strat}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {op === 'rebase' && (
          <div className="space-y-2">
            <label className="block">
              <span className="label block mb-1">Rebase <span className="text-fg font-semibold">{currentBranch}</span> Onto:</span>
              <select
                className="input w-full"
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
              >
                {localBranches.map((b) => (
                  <option key={b.name} value={b.shortName}>
                    {b.shortName} {b.isHead ? '(current)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {(op === 'pull' || op === 'push') && (
          <div className="space-y-2">
            <label className="block">
              <span className="label block mb-1">Remote</span>
              <select
                className="input w-full"
                value={remoteName}
                onChange={(e) => setRemoteName(e.target.value)}
              >
                {remotes.data?.map((r) => (
                  <option key={r.name} value={r.name}>
                    {r.name}
                  </option>
                )) ?? <option value="origin">origin</option>}
              </select>
            </label>

            {op === 'pull' && (
              <div className="space-y-1">
                <span className="label block">Pull Strategy</span>
                <div className="flex gap-2">
                  {(['merge', 'rebase', 'ff-only'] as const).map((strat) => (
                    <label key={strat} className="flex items-center gap-1.5 cursor-pointer text-fg-muted hover:text-fg">
                      <input
                        type="radio"
                        name="pullStrat"
                        checked={pullStrategy === strat}
                        onChange={() => setPullStrategy(strat)}
                        className="accent-accent"
                      />
                      <span className="capitalize text-xxs">{strat === 'ff-only' ? 'FF Only' : strat}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {op === 'push' && (
              <div className="space-y-1">
                <span className="label block">Push Options</span>
                <label className="flex items-center gap-1.5 cursor-pointer text-fg-muted hover:text-fg">
                  <input
                    type="checkbox"
                    checked={pushForce}
                    onChange={(e) => setPushForce(e.target.checked)}
                    className="accent-accent"
                  />
                  <span className="text-xxs">Force with lease (no raw force push)</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* PREVIEW CONTAINER */}
        <div className="border border-border rounded p-2.5 bg-bg-panel/40 min-h-[160px] flex flex-col justify-between">
          <div className="space-y-2 flex-1 min-h-0 overflow-y-auto">
            {op === 'merge' && mergePreviewQuery.data && (
              <MergePreviewDetails preview={mergePreviewQuery.data} />
            )}
            {op === 'rebase' && rebasePlanQuery.data && (
              <RebasePlanDetails preview={rebasePlanQuery.data} />
            )}
            {op === 'pull' && pullPreviewQuery.data && (
              <PullPreviewDetails preview={pullPreviewQuery.data} />
            )}
            {op === 'push' && pushPreviewQuery.data && (
              <PushPreviewDetails preview={pushPreviewQuery.data} />
            )}
            {((op === 'merge' && mergePreviewQuery.isLoading) ||
              (op === 'rebase' && rebasePlanQuery.isLoading) ||
              (op === 'pull' && pullPreviewQuery.isLoading) ||
              (op === 'push' && pushPreviewQuery.isLoading)) && (
              <div className="flex items-center justify-center h-28 text-fg-dim">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading preview...
              </div>
            )}
          </div>

          {op === 'rebase' && rebasePlanQuery.data && (
            <button
              className="btn w-full justify-center mt-2 h-7 text-xs"
              onClick={handleInteractiveRebase}
            >
              Edit Interactive Rebase
            </button>
          )}
          <button
            className="btn btn-primary w-full justify-center mt-3 h-8 text-sm"
            onClick={handleExecute}
            disabled={isPending || (op === 'merge' && !targetBranch) || (op === 'rebase' && !targetBranch)}
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Running...
              </>
            ) : (
              <>
                {op === 'merge' && <GitMerge className="w-4 h-4 mr-2" />}
                {op === 'pull' && <ArrowDown className="w-4 h-4 mr-2" />}
                {op === 'push' && <ArrowUp className="w-4 h-4 mr-2" />}
                {op === 'rebase' && <GitPullRequest className="w-4 h-4 mr-2" />}
                Execute {op}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function MergePreviewDetails({ preview }: { preview: MergePreview }) {
  const isFF = preview.fastForward;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <span className="label">FF status</span>
        <span className={`font-semibold ${isFF ? 'text-git-added' : 'text-git-modified'}`}>
          {isFF ? 'Fast-Forward Possible' : 'Will Create Merge Commit'}
        </span>
      </div>

      <CommitsList title="Expected Commits to Merge" commits={preview.commits} />
      <FilesList files={preview.files} />
    </div>
  );
}

function RebasePlanDetails({ preview }: { preview: RebasePlan }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <span className="label">Rebase Plan</span>
        <span className="text-fg-dim font-medium">{preview.commits.length} commits</span>
      </div>

      <CommitsList title="Commits to Apply" commits={preview.commits} />
      <FilesList files={preview.files} />
    </div>
  );
}

function PullPreviewDetails({ preview }: { preview: PullPreview }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between border-b border-border pb-1">
        <span className="label">Recommended Pull</span>
        <span className="font-semibold text-accent capitalize">{preview.recommendedStrategy}</span>
      </div>

      <CommitsList title="Incoming Commits (Remote)" commits={preview.incoming} />
      <CommitsList title="Local Commits (Ahead)" commits={preview.local} />
    </div>
  );
}

function PushPreviewDetails({ preview }: { preview: PushPreview }) {
  const isBehind = preview.behind > 0;
  return (
    <div className="space-y-2">
      {isBehind && (
        <div className="flex items-start gap-2 p-2 rounded bg-git-deleted/10 border border-git-deleted/30 text-fg text-xxs">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-git-deleted shrink-0" />
          <div>
            <div className="font-semibold text-git-deleted">Push Rejected (Behind Upstream)</div>
            <p className="text-fg-muted mt-0.5">You are behind the remote by {preview.behind} commit(s). Please pull before pushing.</p>
          </div>
        </div>
      )}

      <CommitsList title="Outgoing Commits (To Push)" commits={preview.outgoing} />
    </div>
  );
}

function CommitsList({ title, commits }: { title: string; commits: readonly any[] }) {
  if (commits.length === 0) return null;
  return (
    <div className="space-y-1 mt-2">
      <span className="label block">{title} ({commits.length})</span>
      <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-xxs text-fg-muted border border-border/50 rounded bg-bg-input/50 p-1">
        {commits.map((c) => (
          <div key={c.sha} className="flex gap-2 py-0.5 hover:bg-bg-hover">
            <span className="text-accent shrink-0">{c.sha.slice(0, 7)}</span>
            <span className="truncate flex-1 text-fg">{c.subject}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilesList({ files }: { files: readonly any[] }) {
  if (files.length === 0) return null;
  return (
    <div className="space-y-1 mt-2">
      <span className="label block">Files Touched ({files.length})</span>
      <div className="space-y-1 max-h-32 overflow-y-auto font-mono text-xxs text-fg-muted border border-border/50 rounded bg-bg-input/50 p-1">
        {files.map((f) => (
          <div key={f.path} className="flex justify-between items-center py-0.5 hover:bg-bg-hover pr-1">
            <span className="truncate mr-4 text-fg" title={f.path}>{f.path}</span>
            <span className="shrink-0 flex gap-1.5 font-sans font-semibold">
              {f.additions > 0 && <span className="text-git-added">+{f.additions}</span>}
              {f.deletions > 0 && <span className="text-git-deleted">-{f.deletions}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// src/components/inspector/CommitDetails.tsx — show selected commit info + files + diff + actions.

import { useState } from 'react';
import { User, Clock, Hash, FileText, FilePlus, FileMinus, FileEdit, FileOutput, ChevronRight, GitMerge, GitPullRequest, Copy, RotateCcw, Loader2, Shield, ShieldCheck } from 'lucide-react';
import type { Commit, DiffFile } from '@shared/git';
import { useCommitFiles, useFileContent } from '../../queries/useRepo';
import { useCherryPick, useRevert, useMerge, useRebase } from '../../queries/useMutations';
import { DiffViewer } from '../diff/DiffViewer';
import { languageForFile } from '../../monaco/language';
import type { DiffView } from '../diff/DiffViewer';
import { ConfirmDialog } from '../ConfirmDialog';
import { useRepoStore } from '../../stores/repo';
import { api } from '../../ipc/api';
import { PaneErrorState } from '../ErrorBoundary';

type ActionKind = 'cherry-pick' | 'revert' | 'merge' | 'rebase';

export function CommitDetails({ commit }: { commit: Commit }) {
  const files = useCommitFiles(commit.sha);
  const [selectedFile, setSelectedFile] = useState<DiffFile | null>(null);
  const [diffView, setDiffView] = useState<DiffView>('side-by-side');
  const [gpgVerify, setGpgVerify] = useState<{ loading: boolean; result?: { verified: boolean; signer: string } }>({ loading: false });

  const handleGpgVerify = async () => {
    setGpgVerify({ loading: true });
    try {
      const result = await api.commit.verify({ sha: commit.sha });
      setGpgVerify({ loading: false, result });
    } catch {
      setGpgVerify({ loading: false, result: { verified: false, signer: '' } });
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-3 py-2 border-b border-border shrink-0 bg-bg/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-fg leading-snug truncate">{commit.subject}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-fg-dim">
              <span>{commit.author.name}</span>
              <span>{new Date(commit.author.date).toLocaleString()}</span>
              <span className="font-mono">{commit.sha.slice(0, 7)}</span>
            </div>
          </div>
          <div className="shrink-0">
            {gpgVerify.result ? (
              <span className={`text-xxs px-1.5 py-0.5 rounded ${gpgVerify.result.verified ? 'bg-git-added/20 text-git-added' : 'bg-git-deleted/20 text-git-deleted'}`}>
                <ShieldCheck className="w-3 h-3 inline mr-1" />
                {gpgVerify.result.verified ? `Verified: ${gpgVerify.result.signer}` : 'Not verified'}
              </span>
            ) : (
              <button className="btn !text-xxs !px-2 !py-0.5" onClick={handleGpgVerify} disabled={gpgVerify.loading}>
                {gpgVerify.loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
                {gpgVerify.loading ? 'Verifying...' : 'Verify'}
              </button>
            )}
          </div>
        </div>
        {commit.body && (
          <pre className="mt-1.5 text-xs text-fg-muted whitespace-pre-wrap font-sans line-clamp-4">{commit.body}</pre>
        )}
      </div>

      <div className="px-3 py-2 border-b border-border shrink-0 space-y-1 text-xs">
        <Row icon={<Hash className="w-3.5 h-3.5" />} label="SHA" value={commit.sha} mono />
        <Row icon={<User className="w-3.5 h-3.5" />} label="Author" value={`${commit.author.name} <${commit.author.email}>`} />
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-fg-muted shrink-0" />
          <span className="label w-16 shrink-0">Parents</span>
          <div className="flex flex-wrap gap-1">
            {commit.parents.length === 0 ? (
              <span className="text-fg-dim">root</span>
            ) : (
              commit.parents.map((p) => (
                <span key={p} className="font-mono text-fg-muted">{p.slice(0, 7)}</span>
              ))
            )}
          </div>
        </div>
        {commit.refs.length > 0 && (
          <div className="flex items-start gap-2 pt-1">
            <span className="label w-16 shrink-0 pt-0.5">Refs</span>
            <div className="flex flex-wrap gap-1">
              {commit.refs.map((r) => (
                <span key={`${r.kind}:${r.shortName}`} className="px-1.5 py-0.5 rounded bg-bg-elevated text-xxs font-mono">
                  {r.shortName}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Commit actions */}
      <CommitActions commit={commit} />

      {/* Files changed in this commit */}
      <div className="border-b border-border shrink-0 max-h-40 overflow-y-auto">
        <div className="px-3 py-1.5 label flex items-center justify-between sticky top-0 bg-bg-panel z-10">
          <span>Files changed</span>
          {files.data && <span className="text-fg-dim">{files.data.length}</span>}
        </div>
        {files.isLoading && <div className="px-3 py-2 text-xs text-fg-muted">Loading…</div>}
        {files.error && <PaneErrorState title="Failed to load changed files" message={(files.error as Error).message} onRetry={() => void files.refetch()} />}
        {files.data?.length === 0 && <div className="px-3 py-2 text-xs text-fg-dim">No files.</div>}
        {files.data?.map((f) => (
          <FileRow
            key={f.path}
            file={f}
            selected={selectedFile?.path === f.path}
            onClick={() => {
              setSelectedFile(f);
              useRepoStore.getState().selectFile({
                path: f.path,
                staged: false,
                isCommit: true,
                sha: commit.sha,
                oldPath: f.oldPath,
              });
            }}
          />
        ))}
      </div>

      {/* Diff viewer */}
      <div className="flex-1 min-h-0 flex flex-col">
        {selectedFile && (
          <>
            <div className="h-8 px-3 flex items-center gap-2 border-b border-border shrink-0">
              <button className="icon-btn" onClick={() => { setSelectedFile(null); useRepoStore.getState().selectFile(null); }} title="Back">
                <ChevronRight className="w-3 h-3 rotate-180" />
              </button>
              <span className="text-xs text-fg truncate flex-1 font-mono">{selectedFile.path}</span>
              <div className="flex items-center gap-1">
                <button
                  className={`text-xxs px-1.5 py-0.5 rounded ${diffView === 'side-by-side' ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:bg-bg-hover'}`}
                  onClick={() => setDiffView('side-by-side')}
                >
                  Split
                </button>
                <button
                  className={`text-xxs px-1.5 py-0.5 rounded ${diffView === 'unified' ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:bg-bg-hover'}`}
                  onClick={() => setDiffView('unified')}
                >
                  Unified
                </button>
              </div>
            </div>
            <CommitFileDiff commit={commit} file={selectedFile} view={diffView} />
          </>
        )}
        {!selectedFile && (
          <div className="flex-1 flex items-center justify-center text-xs text-fg-dim">
            Select a file to view its diff.
          </div>
        )}
      </div>
    </div>
  );
}

function FileRow({ file, selected, onClick }: { file: DiffFile; selected: boolean; onClick: () => void }) {
  const Icon = iconForStatus(file);
  const color = colorForFile(file);
  const label = file.oldPath ? `${file.oldPath} → ${file.path}` : file.path;
  const setFileHistory = useRepoStore((s) => s.setFileHistory);

  return (
    <div
      onClick={onClick}
      className={`w-full text-left px-3 py-1 flex items-center gap-2 border-b border-border-subtle/30 cursor-pointer ${selected ? 'bg-accent/10' : 'row-hover'}`}
      title={file.path}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${color}`} />
      <span className="text-xs truncate flex-1">{label}</span>
      <span className="text-xxs shrink-0 flex items-center gap-1">
        <button
          className="icon-btn !w-6 !h-6"
          title="File history"
          onClick={(e) => { e.stopPropagation(); setFileHistory(file.path); }}
        >
          <Clock className="w-3 h-3" />
        </button>
        {file.additions > 0 && <span className="text-git-added">+{file.additions}</span>}
        {file.deletions > 0 && <span className="text-git-deleted">-{file.deletions}</span>}
        {file.isBinary && <span className="text-fg-dim">binary</span>}
      </span>
    </div>
  );
}

export function CommitFileDiff({ commit, file, view }: { commit: Commit; file: DiffFile; view: DiffView }) {
  // Fetch original (parent:sha) and modified (sha) file content.
  const parentRef = commit.parents[0] ?? `${commit.sha}^`;
  const originalContent = useFileContent({
    path: file.oldPath ?? file.path,
    ref: parentRef,
  });
  const modifiedContent = useFileContent({
    path: file.path,
    ref: commit.sha,
  });

  const loading = originalContent.isLoading || modifiedContent.isLoading;
  const error = originalContent.error || modifiedContent.error;

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-xs text-fg-muted">Loading file contents…</div>;
  }
  if (error) {
    return <PaneErrorState title="Failed to load commit diff" message={(error as Error).message} />;
  }

  const original = originalContent.data?.content ?? '';
  const modified = modifiedContent.data?.content ?? '';
  const isBinary = originalContent.data?.isBinary || modifiedContent.data?.isBinary;

  return (
    <div className="flex-1 min-h-0">
      <DiffViewer
        original={original}
        modified={modified}
        language={languageForFile(file.path)}
        view={view}
        binary={isBinary}
      />
    </div>
  );
}

function Row({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-fg-muted shrink-0">{icon}</span>
      <span className="label w-16 shrink-0">{label}</span>
      <span className={`text-fg truncate ${mono ? 'font-mono' : ''}`} title={value}>{value}</span>
    </div>
  );
}

function iconForStatus(f: DiffFile): typeof FileEdit {
  if (f.isRename) return FileOutput;
  if (f.isCopy) return FileOutput;
  if (f.additions > 0 && f.deletions === 0) return FilePlus;
  if (f.deletions > 0 && f.additions === 0) return FileMinus;
  return FileEdit;
}

function colorForFile(f: DiffFile): string {
  if (f.isBinary) return 'text-fg-dim';
  if (f.isRename || f.isCopy) return 'text-git-renamed';
  if (f.additions > 0 && f.deletions === 0) return 'text-git-added';
  if (f.deletions > 0 && f.additions === 0) return 'text-git-deleted';
  return 'text-git-modified';
}

function CommitActions({ commit }: { commit: Commit }) {
  const cherry = useCherryPick();
  const revert = useRevert();
  const merge = useMerge();
  const rebase = useRebase();
  const [confirm, setConfirm] = useState<ActionKind | null>(null);

  const branchRef = commit.refs.find((r) => r.kind === 'local' && !r.isHead);
  const branchName = branchRef?.shortName;

  const runAction = () => {
    if (!confirm) return;
    if (confirm === 'cherry-pick') void cherry.mutate({ shas: [commit.sha] });
    if (confirm === 'revert') void revert.mutate({ shas: [commit.sha] });
    if (confirm === 'merge' && branchName) void merge.mutate({ ref: branchName });
    if (confirm === 'rebase' && branchName) void rebase.mutate({ onto: branchName });
    setConfirm(null);
  };

  const pending = cherry.isPending || revert.isPending || merge.isPending || rebase.isPending;

  return (
    <div className="px-3 py-2 border-b border-border shrink-0 flex items-center gap-1 flex-wrap">
      <ActionButton
        icon={<Copy className="w-3.5 h-3.5" />}
        label="Cherry-pick"
        title="Cherry-pick this commit onto HEAD"
        pending={cherry.isPending}
        disabled={pending}
        onClick={() => setConfirm('cherry-pick')}
      />
      <ActionButton
        icon={<RotateCcw className="w-3.5 h-3.5" />}
        label="Revert"
        title="Create a commit that reverts this commit"
        pending={revert.isPending}
        disabled={pending}
        onClick={() => setConfirm('revert')}
      />
      {branchName && (
        <>
          <ActionButton
            icon={<GitMerge className="w-3.5 h-3.5" />}
            label={`Merge ${branchName}`}
            title={`Merge ${branchName} into current branch`}
            pending={merge.isPending}
            disabled={pending}
            onClick={() => setConfirm('merge')}
          />
          <ActionButton
            icon={<GitPullRequest className="w-3.5 h-3.5" />}
            label={`Rebase onto ${branchName}`}
            title={`Rebase current branch onto ${branchName}`}
            pending={rebase.isPending}
            disabled={pending}
            onClick={() => setConfirm('rebase')}
          />
        </>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirmTitle(confirm)}
        message={confirmMessage(confirm, commit.sha.slice(0, 7), branchName)}
        confirmLabel={confirmLabel(confirm)}
        danger={confirm === 'revert'}
        onConfirm={runAction}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}

function ActionButton({
  icon, label, title, pending, disabled, onClick,
}: {
  icon: React.ReactNode; label: string; title: string; pending: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button
      className="btn !text-xxs !px-2 !py-0.5"
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}

function confirmTitle(kind: ActionKind | null): string {
  switch (kind) {
    case 'cherry-pick': return 'Cherry-pick commit?';
    case 'revert': return 'Revert commit?';
    case 'merge': return 'Merge branch?';
    case 'rebase': return 'Rebase current branch?';
    default: return '';
  }
}

function confirmLabel(kind: ActionKind | null): string {
  switch (kind) {
    case 'cherry-pick': return 'Cherry-pick';
    case 'revert': return 'Revert';
    case 'merge': return 'Merge';
    case 'rebase': return 'Rebase';
    default: return 'Confirm';
  }
}

function confirmMessage(kind: ActionKind | null, shortSha: string, branchName?: string): string {
  switch (kind) {
    case 'cherry-pick': return `Apply commit ${shortSha} onto the current branch?`;
    case 'revert': return `Create a new commit that reverts the changes from ${shortSha}?`;
    case 'merge': return `Merge ${branchName} into the current branch? This may create a merge commit.`;
    case 'rebase': return `Rebase the current branch onto ${branchName}? This rewrites commit history.`;
    default: return '';
  }
}

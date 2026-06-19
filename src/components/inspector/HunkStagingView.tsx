// src/components/inspector/HunkStagingView.tsx — interactive hunk-by-hunk diff view and staging.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import { Plus, Minus, Loader2 } from 'lucide-react';
import type { Hunk, DiffLine } from '@shared/git';

interface HunkStagingViewProps {
  path: string;
  staged: boolean;
  oldPath?: string | null;
  status?: 'added' | 'modified' | 'deleted' | 'renamed';
}

export function HunkStagingView({ path, staged, oldPath, status }: HunkStagingViewProps) {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['diffFileHunks', path, staged],
    queryFn: () =>
      api.diff.file({
        path,
        contextLines: 3,
        ignoreWhitespace: false,
        ref: staged ? 'HEAD' : undefined,
      }),
    refetchOnWindowFocus: false,
  });

  const stageHunkMutation = useMutation({
    mutationFn: (patch: string) => api.workingTree.stageHunks(path, patch),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });

  const unstageHunkMutation = useMutation({
    mutationFn: (patch: string) => api.workingTree.unstageHunks(path, patch),
    onSuccess: () => {
      void qc.invalidateQueries();
    },
  });

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-dim text-xs">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading hunks...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-3 text-xs text-git-deleted">
        Failed to load diff: {(error as Error).message}
      </div>
    );
  }

  const hunks = data?.hunks ?? [];
  const fileStatus = status ?? data?.oldPath ? 'renamed' : 'modified';

  if (hunks.length === 0) {
    return (
      <div className="p-3 text-center text-xs text-fg-dim">
        No hunks to display. The file is {staged ? 'clean in index' : 'unmodified in working tree'}.
      </div>
    );
  }

  const handleStageHunk = (h: Hunk) => {
    const patch = generatePatch(path, h, fileStatus, oldPath ?? data?.oldPath);
    void stageHunkMutation.mutate(patch);
  };

  const handleUnstageHunk = (h: Hunk) => {
    const patch = generatePatch(path, h, fileStatus, oldPath ?? data?.oldPath);
    void unstageHunkMutation.mutate(patch);
  };

  const isPending = stageHunkMutation.isPending || unstageHunkMutation.isPending;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto p-3 space-y-4 text-xs">
      {hunks.map((h, idx) => (
        <div key={idx} className="border border-border rounded overflow-hidden">
          <div className="bg-bg-panel px-3 py-1.5 border-b border-border flex items-center justify-between font-mono text-xxs text-fg-muted select-none">
            <span>{h.header}</span>
            <button
              className="btn btn-primary !text-xxs !px-2 !py-0.5"
              onClick={() => (staged ? handleUnstageHunk(h) : handleStageHunk(h))}
              disabled={isPending}
            >
              {staged ? (
                <>
                  <Minus className="w-3 h-3 mr-1" /> Unstage Hunk
                </>
              ) : (
                <>
                  <Plus className="w-3 h-3 mr-1" /> Stage Hunk
                </>
              )}
            </button>
          </div>
          <div className="font-mono text-xxs overflow-x-auto whitespace-pre bg-bg-input/30 p-2">
            {h.lines.map((l, lIdx) => (
              <div
                key={lIdx}
                className={`py-0.5 px-1 rounded flex ${lineBgClass(l.type)}`}
              >
                <span className="w-8 select-none text-fg-dim text-right pr-2 shrink-0">{l.oldLineNo ?? ''}</span>
                <span className="w-8 select-none text-fg-dim text-right pr-2 shrink-0">{l.newLineNo ?? ''}</span>
                <span className={`select-none w-4 shrink-0 text-center font-bold ${lineSignColor(l.type)}`}>
                  {lineSign(l.type)}
                </span>
                <span className={`flex-1 text-left ${lineTextColor(l.type)}`}>{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function generatePatch(path: string, hunk: Hunk, status?: string, oldPath?: string | null): string {
  const lines: string[] = [];
  const useOldPath = (status === 'deleted' || status === 'renamed') && oldPath ? oldPath : path;

  if (status === 'added') {
    lines.push(`diff --git a/${path} b/${path}`);
    lines.push('new file mode 100644');
    lines.push('--- /dev/null');
    lines.push(`+++ b/${path}`);
  } else if (status === 'deleted') {
    lines.push(`diff --git a/${path} b/${path}`);
    lines.push('deleted file mode 100644');
    lines.push(`--- a/${path}`);
    lines.push('+++ /dev/null');
  } else if (status === 'renamed' && oldPath) {
    lines.push(`diff --git a/${oldPath} b/${path}`);
    lines.push(`--- a/${oldPath}`);
    lines.push(`+++ b/${path}`);
  } else {
    lines.push(`diff --git a/${useOldPath} b/${path}`);
    lines.push(`--- a/${useOldPath}`);
    lines.push(`+++ b/${path}`);
  }

  lines.push(hunk.header);
  for (const line of hunk.lines) {
    if (line.type === 'context') {
      lines.push(` ${line.text}`);
    } else if (line.type === 'add') {
      lines.push(`+${line.text}`);
    } else if (line.type === 'del') {
      lines.push(`-${line.text}`);
    } else if (line.type === 'no-newline') {
      lines.push('\\ No newline at end of file');
    }
  }
  return lines.join('\n') + '\n';
}

function lineBgClass(type: DiffLine['type']): string {
  switch (type) {
    case 'add': return 'bg-git-added/10 hover:bg-git-added/15';
    case 'del': return 'bg-git-deleted/10 hover:bg-git-deleted/15';
    default: return 'hover:bg-bg-hover/50';
  }
}

function lineTextColor(type: DiffLine['type']): string {
  switch (type) {
    case 'add': return 'text-git-added';
    case 'del': return 'text-git-deleted';
    default: return 'text-fg-muted';
  }
}

function lineSign(type: DiffLine['type']): string {
  if (type === 'add') return '+';
  if (type === 'del') return '-';
  return ' ';
}

function lineSignColor(type: DiffLine['type']): string {
  if (type === 'add') return 'text-git-added';
  if (type === 'del') return 'text-git-deleted';
  return 'text-fg-dim';
}

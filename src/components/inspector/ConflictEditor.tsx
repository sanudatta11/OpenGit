// src/components/inspector/ConflictEditor.tsx — interactive Git conflict resolution editor.

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../ipc/api';
import { useStatus } from '../../queries/useRepo';
import { AlertTriangle, ChevronRight, Check, ArrowLeft, Loader2 } from 'lucide-react';

interface ConflictBlock {
  type: 'normal' | 'conflict';
  content?: string;
  current?: string;
  incoming?: string;
  ourLabel?: string;
  theirLabel?: string;
  id?: string;
}

export function ConflictEditor() {
  const qc = useQueryClient();
  const status = useStatus();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const conflicts = status.data?.entries.filter((e) => e.kind === 'unmerged') ?? [];

  if (conflicts.length === 0) {
    return (
      <div className="p-3 text-xs text-fg-muted flex items-center gap-2">
        <Check className="w-4 h-4 text-git-added" />
        No active conflicts in the working tree.
      </div>
    );
  }

  if (!selectedFile) {
    return (
      <div className="flex-1 flex flex-col min-h-0 text-xs text-fg p-3">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-git-conflicted shrink-0" />
          <h2 className="text-sm font-semibold text-fg">Conflicts to Resolve ({conflicts.length})</h2>
        </div>
        <p className="text-fg-muted mb-3">Select a file below to begin interactive resolution.</p>
        <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded bg-bg-panel/40">
          {conflicts.map((file) => (
            <button
              key={file.path}
              className="w-full text-left px-3 py-2 border-b border-border hover:bg-bg-hover flex items-center justify-between"
              onClick={() => setSelectedFile(file.path)}
            >
              <span className="font-mono text-git-conflicted truncate mr-2">{file.path}</span>
              <ChevronRight className="w-4 h-4 text-fg-dim" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <FileConflictResolver
      path={selectedFile}
      onBack={() => setSelectedFile(null)}
      onResolved={() => {
        setSelectedFile(null);
        void qc.invalidateQueries();
      }}
    />
  );
}

function FileConflictResolver({
  path,
  onBack,
  onResolved,
}: {
  path: string;
  onBack: () => void;
  onResolved: () => void;
}) {
  const [decisions, setDecisions] = useState<Record<string, 'current' | 'incoming' | 'both'>>({});
  const [resolvedContent, setResolvedContent] = useState('');

  // Fetch the parsed conflict blocks
  const { data, isLoading, error } = useQuery({
    queryKey: ['conflictFile', path],
    queryFn: () => api.conflict.file(path),
    refetchOnWindowFocus: false,
  });

  const resolveMutation = useMutation({
    mutationFn: (content: string) => api.conflict.resolve(path, content),
    onSuccess: (res) => {
      if (res.success) {
        onResolved();
      } else {
        alert(`Failed to resolve: ${res.stderr || 'unknown error'}`);
      }
    },
  });

  const blocks: ConflictBlock[] = data?.blocks ?? [];
  const conflictBlocks = blocks.filter((b) => b.type === 'conflict');

  // Compute final content whenever decisions change
  useEffect(() => {
    if (blocks.length === 0) return;
    const finalLines: string[] = [];

    for (const b of blocks) {
      if (b.type === 'normal') {
        if (b.content !== undefined) finalLines.push(b.content);
      } else {
        const dec = decisions[b.id!];
        if (dec === 'current') {
          if (b.current !== undefined) finalLines.push(b.current);
        } else if (dec === 'incoming') {
          if (b.incoming !== undefined) finalLines.push(b.incoming);
        } else if (dec === 'both') {
          if (b.current !== undefined) finalLines.push(b.current);
          if (b.incoming !== undefined) finalLines.push(b.incoming);
        } else {
          // Keep conflict markers if unresolved
          finalLines.push(`<<<<<<< ${b.ourLabel ?? 'HEAD'}`);
          if (b.current !== undefined) finalLines.push(b.current);
          finalLines.push('=======');
          if (b.incoming !== undefined) finalLines.push(b.incoming);
          finalLines.push(`>>>>>>> ${b.theirLabel ?? 'Incoming'}`);
        }
      }
    }

    setResolvedContent(finalLines.join('\n'));
  }, [blocks, decisions]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-fg-dim text-xs">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Parsing conflict markers...
      </div>
    );
  }

  if (error) {
    return <div className="p-3 text-xs text-git-deleted">Failed to load conflict details: {(error as Error).message}</div>;
  }

  const allResolved = conflictBlocks.every((b) => decisions[b.id!] !== undefined);

  return (
    <div className="flex-1 flex flex-col min-h-0 text-xs text-fg">
      {/* Header */}
      <div className="h-9 border-b border-border bg-bg-panel/50 px-2 flex items-center gap-2 shrink-0">
        <button className="icon-btn" onClick={onBack} title="Back to list">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="font-semibold truncate flex-1 font-mono">{path.split('/').pop() ?? path}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-0">
        {conflictBlocks.map((b, idx) => {
          const selection = decisions[b.id!];
          return (
            <div key={b.id} className="border border-border rounded overflow-hidden">
              <div className="bg-bg-panel px-3 py-1.5 border-b border-border flex items-center justify-between font-semibold text-git-conflicted text-xxs">
                <span>CONFLICT {idx + 1} OF {conflictBlocks.length}</span>
                <span className="font-mono text-fg-dim">{b.id}</span>
              </div>

              <div className="grid grid-cols-2 border-b border-border divide-x divide-border">
                {/* Current */}
                <div className="p-2 space-y-1">
                  <div className="text-xxs uppercase tracking-wider text-git-added font-semibold truncate">Current ({b.ourLabel})</div>
                  <pre className="font-mono text-xxs bg-bg-input/30 p-1.5 rounded overflow-x-auto max-h-24 whitespace-pre-wrap">
                    {b.current || <span className="text-fg-dim italic">Empty</span>}
                  </pre>
                  <button
                    className={`btn w-full justify-center text-xxs ${selection === 'current' ? 'btn-primary' : ''}`}
                    onClick={() => setDecisions((prev) => ({ ...prev, [b.id!]: 'current' }))}
                  >
                    Accept Current
                  </button>
                </div>

                {/* Incoming */}
                <div className="p-2 space-y-1">
                  <div className="text-xxs uppercase tracking-wider text-accent font-semibold truncate">Incoming ({b.theirLabel})</div>
                  <pre className="font-mono text-xxs bg-bg-input/30 p-1.5 rounded overflow-x-auto max-h-24 whitespace-pre-wrap">
                    {b.incoming || <span className="text-fg-dim italic">Empty</span>}
                  </pre>
                  <button
                    className={`btn w-full justify-center text-xxs ${selection === 'incoming' ? 'btn-primary' : ''}`}
                    onClick={() => setDecisions((prev) => ({ ...prev, [b.id!]: 'incoming' }))}
                  >
                    Accept Incoming
                  </button>
                </div>
              </div>

              {/* Both option */}
              <div className="p-2 bg-bg-panel/20 text-center">
                <button
                  className={`btn text-xxs px-4 ${selection === 'both' ? 'btn-primary' : ''}`}
                  onClick={() => setDecisions((prev) => ({ ...prev, [b.id!]: 'both' }))}
                >
                  Accept Both (Current + Incoming)
                </button>
              </div>
            </div>
          );
        })}

        {/* Live Result Preview */}
        <div className="space-y-1">
          <span className="label block">Resolved Result Preview</span>
          <pre className="font-mono text-xxs bg-bg-input border border-border p-2.5 rounded overflow-auto max-h-48 whitespace-pre-wrap text-fg-muted">
            {resolvedContent}
          </pre>
        </div>
      </div>

      {/* Footer Save Actions */}
      <div className="p-3 border-t border-border bg-bg-panel/30 shrink-0">
        <button
          className="btn btn-primary w-full justify-center h-8 text-sm"
          disabled={resolveMutation.isPending || !allResolved}
          onClick={() => resolveMutation.mutate(resolvedContent)}
        >
          {resolveMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...
            </>
          ) : (
            <>
              <Check className="w-4 h-4 mr-2" /> Mark as Resolved & Stage
            </>
          )}
        </button>
        {!allResolved && (
          <p className="text-center text-xxs text-fg-dim mt-1.5">You must make a choice for all conflicts to save.</p>
        )}
      </div>
    </div>
  );
}

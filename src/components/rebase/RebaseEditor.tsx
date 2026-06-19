// src/components/rebase/RebaseEditor.tsx — interactive rebase modal editor.

import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { X, GripVertical, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../ipc/api';
import { useRebaseStore } from '../../stores/rebase';
import type { RebaseInteractiveAction } from '@shared/ipc';

function actionColor(action: string): string {
  switch (action) {
    case 'pick': return 'text-git-added';
    case 'squash': case 'fixup': return 'text-git-modified';
    case 'reword': return 'text-accent';
    case 'drop': return 'text-git-deleted';
    case 'edit': return 'text-git-conflicted';
    default: return 'text-fg-muted';
  }
}

const actionLabels: Record<string, string> = {
  pick: 'Pick',
  squash: 'Squash',
  fixup: 'Fixup',
  reword: 'Reword',
  drop: 'Drop',
  edit: 'Edit',
  exec: 'Exec',
};

const ACTIONS: RebaseInteractiveAction[] = ['pick', 'squash', 'fixup', 'reword', 'drop', 'edit'];

export function RebaseEditor() {
  const qc = useQueryClient();
  const { isActive, onto, currentBranch, items, setInactive, updateAction, reorder, updateMessage } = useRebaseStore();
  const [applying, setApplying] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionPopoverId, setActionPopoverId] = useState<string | null>(null);

  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setInactive();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isActive, setInactive]);

  const handleCancel = useCallback(() => setInactive(), [setInactive]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const result = await api.rebaseInteractive.apply({
        onto,
        items: items.map((i) => ({ action: i.action, sha: i.sha })),
      });
      if (result.success) {
        setInactive();
        void qc.invalidateQueries();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setApplying(false);
    }
  };

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const handleDragStart = (index: number) => () => setDragIndex(index);

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;
    reorder(dragIndex, index);
    setDragIndex(index);
  };

  const handleDragEnd = () => setDragIndex(null);

  if (!isActive) return null;

  const netPick = items.filter((i) => i.action === 'pick').length;
  const netSquash = items.filter((i) => i.action === 'squash' || i.action === 'fixup').length;
  const netDrop = items.filter((i) => i.action === 'drop').length;
  const netReword = items.filter((i) => i.action === 'reword' || i.action === 'edit').length;
  const finalCount = netPick + netSquash + netReword;
  const resultText = `${items.length} commit${items.length !== 1 ? 's' : ''} → ${finalCount} commit${finalCount !== 1 ? 's' : ''}${netDrop > 0 ? ` (${netDrop} drop${netDrop !== 1 ? 's' : ''})` : ''}${netSquash > 0 ? ` (${netSquash} squash${netSquash !== 1 ? 'es' : ''})` : ''}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={handleCancel}>
      <div
        className="w-full max-w-2xl bg-bg border border-border rounded-lg shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-border shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-fg">
              Interactive Rebase: {currentBranch} onto {onto}
            </h3>
          </div>
          <button className="icon-btn" onClick={handleCancel}><X className="w-4 h-4" /></button>
        </div>

        {/* Summary bar */}
        <div className="px-4 py-2 border-b border-border bg-bg-panel/40 text-xxs text-fg-muted">
          <span className="font-medium text-fg">{currentBranch}</span> ({items.length} commit{items.length !== 1 ? 's' : ''}) will be replayed onto <span className="font-medium text-fg">{onto}</span>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {items.length === 0 && (
            <div className="text-center text-xs text-fg-dim py-8">No commits to rebase.</div>
          )}
          {items.map((item, index) => (
            <div
              key={item.id}
              className={`border border-border rounded bg-bg-panel/30 ${item.action === 'drop' ? 'opacity-50' : ''}`}
              draggable
              onDragStart={handleDragStart(index)}
              onDragOver={handleDragOver(index)}
              onDragEnd={handleDragEnd}
            >
              <div className="flex items-center gap-2 px-3 py-2">
                {/* Drag handle */}
                <span className="cursor-grab text-fg-dim hover:text-fg shrink-0">
                  <GripVertical className="w-3.5 h-3.5" />
                </span>

                {/* Action badge */}
                <div className="relative shrink-0">
                  <button
                    className={`text-xxs font-semibold uppercase px-2 py-0.5 rounded border ${actionColor(item.action)} border-current/30 hover:bg-bg-hover`}
                    onClick={() => setActionPopoverId(actionPopoverId === item.id ? null : item.id)}
                  >
                    {item.action}
                  </button>
                  {actionPopoverId === item.id && (
                    <div
                      className="absolute top-full left-0 mt-1 z-20 bg-bg-panel border border-border rounded shadow-lg p-1 flex flex-col min-w-[90px]"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {ACTIONS.map((a) => (
                        <button
                          key={a}
                          className={`text-xxs text-left px-2 py-1 rounded hover:bg-bg-hover capitalize ${actionColor(a)} ${item.action === a ? 'font-semibold bg-bg-hover' : ''}`}
                          onClick={() => { updateAction(item.id, a); setActionPopoverId(null); }}
                        >
                          {actionLabels[a]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* SHA */}
                <span className="text-accent font-mono text-xxs shrink-0">{item.sha.slice(0, 7)}</span>

                {/* Subject */}
                <span className="text-xs text-fg truncate flex-1">{item.subject}</span>

                {/* Expand button for reword */}
                {item.action === 'reword' && (
                  <button
                    className="icon-btn !w-5 !h-5 shrink-0"
                    onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                    title="Edit commit message"
                  >
                    {expandedId === item.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {/* Expanded: reword message input */}
              {expandedId === item.id && item.action === 'reword' && (
                <div className="px-3 pb-2 pl-[72px]">
                  <input
                    className="input w-full text-xs font-mono"
                    value={item.subject}
                    onChange={(e) => updateMessage(item.id, e.target.value)}
                    placeholder="New commit message"
                  />
                </div>
              )}

              {/* Squash/fixup target hint */}
              {item.action === 'squash' && index > 0 && (
                <div className="px-3 pb-2 pl-[72px] text-xxs text-git-modified">
                  squashes into: {items[index - 1]?.sha.slice(0, 7)} {items[index - 1]?.subject?.slice(0, 50)}
                </div>
              )}
              {item.action === 'fixup' && index > 0 && (
                <div className="px-3 pb-2 pl-[72px] text-xxs text-git-modified">
                  fixups into: {items[index - 1]?.sha.slice(0, 7)} {items[index - 1]?.subject?.slice(0, 50)}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-border space-y-3">
          <div className="text-xxs text-fg-muted">
            Result: {resultText}
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn" onClick={handleCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={handleApply} disabled={applying || items.length === 0}>
              {applying ? 'Applying...' : 'Start Interactive Rebase'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// src/components/ConfirmDialog.tsx — modal confirmation dialog for destructive ops.

import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  details?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  message,
  details,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel, onConfirm]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md bg-bg-panel border border-border rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex items-start gap-3 border-b border-border">
          {danger && (
            <AlertTriangle className="w-5 h-5 text-git-deleted shrink-0 mt-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-fg">{title}</h2>
            <p className="mt-1 text-xs text-fg-muted">{message}</p>
            {children}
          </div>
        </div>
        {details && (
          <div className="p-4 border-b border-border">
            <pre className="text-xs text-fg-muted whitespace-pre-wrap font-mono max-h-40 overflow-y-auto">
              {details}
            </pre>
          </div>
        )}
        <div className="p-3 flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>{cancelLabel}</button>
          <button
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

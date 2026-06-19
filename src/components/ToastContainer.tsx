// src/components/ToastContainer.tsx — fixed bottom-right toast stack with slide-in animation.

import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useToastStore } from '../stores/toast';
import type { ToastType } from '../stores/toast';

const ICON: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const STYLE: Record<ToastType, string> = {
  success: 'border-git-added/40 bg-git-added/10 text-git-added',
  error: 'border-git-deleted/40 bg-git-deleted/10 text-git-deleted',
  info: 'border-accent/40 bg-accent/10 text-accent',
};

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismissToast);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICON[t.type];
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-2 px-3 py-2 rounded border text-xs shadow-lg max-w-sm animate-slide-in ${STYLE[t.type]}`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="flex-1 truncate">{t.message}</span>
            <button className="icon-btn !w-4 !h-4 shrink-0 opacity-60 hover:opacity-100" onClick={() => dismiss(t.id)}>
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

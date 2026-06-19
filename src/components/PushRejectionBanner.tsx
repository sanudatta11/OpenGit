import { useState } from 'react';
import { AlertTriangle, X, ArrowDown, ArrowUp } from 'lucide-react';
import { usePull, usePush } from '../queries/useMutations';
import { usePushBannerStore } from '../stores/pushBanner';

export function PushRejectionBanner() {
  const rejection = usePushBannerStore((s) => s.rejection);
  const setRejection = usePushBannerStore((s) => s.setRejection);
  const [dismissing, setDismissing] = useState(false);
  const pull = usePull();
  const forcePush = usePush();

  if (!rejection) return null;

  const handleDismiss = () => {
    setDismissing(true);
    setTimeout(() => {
      setRejection(null);
      setDismissing(false);
    }, 200);
  };

  const handlePull = (strategy: 'merge' | 'rebase') => {
    pull.mutate(
      { remote: rejection.remote ?? 'origin', ffOnly: false, strategy },
      { onSuccess: () => setRejection(null) },
    );
  };

  const handleForcePush = () => {
    forcePush.mutate(
      { remote: rejection.remote ?? 'origin', branch: rejection.branch, forceWithLease: true },
      { onSuccess: () => setRejection(null) },
    );
  };

  const isRejected = rejection.rejected;
  const errorMsg = rejection.message || 'Push failed';

  return (
    <div
      className={`border-b px-3 py-2.5 flex items-center gap-3 shrink-0 ${dismissing ? 'animate-slide-up' : 'animate-slide-down'} ${isRejected ? 'border-git-conflicted/40 bg-git-conflicted/10' : 'border-git-deleted/40 bg-git-deleted/10'}`}
    >
      <AlertTriangle
        className={`w-4 h-4 shrink-0 ${isRejected ? 'text-git-conflicted' : 'text-git-deleted'}`}
      />
      <div className="flex-1 min-w-0">
        <div
          className={`text-xs font-medium ${isRejected ? 'text-git-conflicted' : 'text-git-deleted'}`}
        >
          {isRejected ? 'Push rejected — branch is behind remote' : 'Push failed'}
        </div>
        <div className="text-xxs text-fg-muted mt-0.5 truncate">{errorMsg}</div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {isRejected && (
          <>
            <button
              className="btn !text-xxs !px-2 !py-0.5"
              onClick={() => handlePull('rebase')}
              disabled={pull.isPending}
              title="Pull with rebase"
            >
              <ArrowDown className="w-3 h-3 mr-1" /> Rebase
            </button>
            <button
              className="btn !text-xxs !px-2 !py-0.5"
              onClick={() => handlePull('merge')}
              disabled={pull.isPending}
              title="Pull with merge"
            >
              <ArrowDown className="w-3 h-3 mr-1" /> Merge
            </button>
            <button
              className="btn !text-xxs !px-2 !py-0.5"
              onClick={handleForcePush}
              disabled={forcePush.isPending}
              title="Force push with lease"
            >
              <ArrowUp className="w-3 h-3 mr-1" /> Force
            </button>
          </>
        )}
        <button className="icon-btn hover:text-fg" onClick={handleDismiss} title="Dismiss">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

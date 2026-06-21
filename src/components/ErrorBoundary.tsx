import React from 'react';

interface ErrorBoundaryProps {
  title: string;
  onRetry?: () => void;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  private handleRetry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  private handleCopy = async () => {
    if (!this.state.error) return;
    await navigator.clipboard.writeText(this.state.error.stack || this.state.error.message);
  };

  override render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="h-full w-full flex items-center justify-center p-4 bg-bg-panel">
        <div className="max-w-md w-full rounded-xl border border-border bg-bg px-4 py-5 shadow-lg">
          <div className="text-sm font-semibold text-fg">{this.props.title}</div>
          <div className="mt-2 text-xs text-fg-muted">
            {this.state.error.message || 'Something went wrong in this pane.'}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button className="btn btn-primary text-xs" onClick={this.handleRetry}>Retry</button>
            <button className="btn text-xs" onClick={() => void this.handleCopy()}>Copy error</button>
          </div>
        </div>
      </div>
    );
  }
}

export function PaneErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="h-full w-full flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-xl border border-border bg-bg-panel px-4 py-5 shadow-sm">
        <div className="text-sm font-semibold text-fg">{title}</div>
        <div className="mt-2 text-xs text-fg-muted whitespace-pre-wrap break-words">{message}</div>
        {onRetry && (
          <div className="mt-4">
            <button className="btn btn-primary text-xs" onClick={onRetry}>Retry</button>
          </div>
        )}
      </div>
    </div>
  );
}

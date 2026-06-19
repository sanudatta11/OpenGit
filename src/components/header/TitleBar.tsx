// src/components/header/TitleBar.tsx — macOS-only title bar row.
// Provides a drag region and safe-area padding for traffic-light buttons.

import { IS_MAC } from '../../utils/platform';

export function TitleBar({ children }: { children?: React.ReactNode }) {
  if (!IS_MAC) return null;

  return (
    <div
      className="h-8 flex items-center px-3 border-b border-border bg-bg-panel shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left safe area — leave 80 px for traffic lights. */}
      <div className="w-20 shrink-0" />
      {/* Center / right content (e.g. app name, breadcrumbs). */}
      <div
        className="flex-1 min-w-0 flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {children}
      </div>
    </div>
  );
}

// src/components/TopBar.tsx — workspace header: macOS title bar, repo tabs, toolbar.
// Split into three rows on macOS (title bar + tabs + actions).
// On Windows/Linux: tabs + actions only.

import { TitleBar } from './header/TitleBar';
import { Toolbar } from './header/Toolbar';
import { TabBar } from './TabBar';

export function TopBar({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <>
      <TitleBar />

      {/* Row 2 — repo tabs */}
      <div className="h-8 flex items-center px-2 border-b border-border bg-bg-panel shrink-0 gap-2">
        <TabBar />
      </div>

      {/* Row 3 — actions / toolbar */}
      <Toolbar onOpenSettings={onOpenSettings} />
    </>
  );
}

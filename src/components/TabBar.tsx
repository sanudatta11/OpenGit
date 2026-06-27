// src/components/TabBar.tsx — session tab bar with repo and dashboard tabs.

import { useState, useRef } from 'react';
import { useRepoStore, repoName } from '../stores/repo';
import { useCloseRepo, useSwitchRepo } from '../queries/useRepo';
import { Plus, X } from 'lucide-react';

interface DragState {
  activeId: string;
  startIndex: number;
  currentIndex: number;
  startX: number;
  currentX: number;
  rects: DOMRect[];
}

export function TabBar() {
  const tabs = useRepoStore((s) => s.tabs);
  const activeTabId = useRepoStore((s) => s.activeTabId);
  const activateTab = useRepoStore((s) => s.activateTab);
  const openDashboardTab = useRepoStore((s) => s.openDashboardTab);
  const closeRepo = useCloseRepo();
  const switchRepo = useSwitchRepo();

  const tabContainerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const hasDraggedRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>, tabId: string, index: number) => {
    if (e.button !== 0) return;
    
    // Prevent dragging if clicking the close (X) button
    if ((e.target as HTMLElement).closest('svg')) {
      return;
    }
    
    if (!tabContainerRef.current) return;
    
    const children = Array.from(tabContainerRef.current.children) as HTMLElement[];
    const tabElements = children.filter(child => child.hasAttribute('data-tab-id'));
    const rects = tabElements.map(el => el.getBoundingClientRect());
    
    e.currentTarget.setPointerCapture(e.pointerId);
    hasDraggedRef.current = false;
    setDragState({
      activeId: tabId,
      startIndex: index,
      currentIndex: index,
      startX: e.clientX,
      currentX: e.clientX,
      rects,
    });
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || dragState.activeId !== e.currentTarget.getAttribute('data-tab-id')) return;
    
    const deltaX = e.clientX - dragState.startX;
    if (Math.abs(deltaX) > 3) {
      hasDraggedRef.current = true;
    }
    
    const currentX = e.clientX;
    const startRect = dragState.rects[dragState.startIndex];
    if (!startRect) return;
    const midX = startRect.left + startRect.width / 2 + deltaX;
    
    const centers = dragState.rects.map(r => r.left + r.width / 2);
    let targetIndex = 0;
    for (let i = 0; i < centers.length; i++) {
      if (i === dragState.startIndex) continue;
      const center = centers[i];
      if (center !== undefined && midX > center) {
        targetIndex++;
      }
    }
    
    setDragState(prev => prev ? {
      ...prev,
      currentX,
      currentIndex: targetIndex,
    } : null);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || dragState.activeId !== e.currentTarget.getAttribute('data-tab-id')) return;
    
    e.currentTarget.releasePointerCapture(e.pointerId);
    
    if (dragState.currentIndex !== dragState.startIndex) {
      useRepoStore.getState().reorderTabs(dragState.startIndex, dragState.currentIndex);
    }
    
    setDragState(null);
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState || dragState.activeId !== e.currentTarget.getAttribute('data-tab-id')) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragState(null);
  };

  return (
    <div ref={tabContainerRef} className="flex items-center gap-0.5 shrink-0">
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTabId;
        const isRepoTab = tab.kind === 'repo';
        const name = isRepoTab
          ? repoName(tab.repoInfo ?? {
            path: tab.repoPath,
            gitDir: '',
            isBare: false,
            isShallow: false,
            isDetached: false,
            headSha: null,
            currentBranch: null,
            gitVersion: '',
          })
          : 'Dashboard';

        let transform = undefined;
        let transition = 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)';
        let zIndex = undefined;

        if (dragState) {
          const isDragged = tab.id === dragState.activeId;
          if (isDragged) {
            const deltaX = dragState.currentX - dragState.startX;
            let clampedDeltaX = deltaX;
            const draggedRect = dragState.rects[dragState.startIndex];
            if (draggedRect && tabContainerRef.current) {
              const containerRect = tabContainerRef.current.getBoundingClientRect();
              const minDelta = containerRect.left - draggedRect.left;
              const maxDelta = containerRect.right - draggedRect.right - 36;
              clampedDeltaX = Math.max(minDelta, Math.min(maxDelta, deltaX));
            }
            transform = `translateX(${clampedDeltaX}px)`;
            transition = 'none';
            zIndex = 50;
          } else {
            const { startIndex, currentIndex } = dragState;
            const draggedRect = dragState.rects[startIndex];
            const gap = 2; // gap-0.5 is 2px
            const shiftAmount = draggedRect ? draggedRect.width + gap : 0;

            let shiftX = 0;
            if (currentIndex > startIndex && i > startIndex && i <= currentIndex) {
              shiftX = -shiftAmount;
            } else if (currentIndex < startIndex && i >= currentIndex && i < startIndex) {
              shiftX = shiftAmount;
            }

            if (shiftX !== 0) {
              transform = `translateX(${shiftX}px)`;
            }
          }
        }

        return (
          <button
            key={tab.id}
            data-tab-id={tab.id}
            style={{
              transform,
              transition,
              zIndex,
              position: 'relative',
              touchAction: 'none',
            }}
            onPointerDown={(e) => onPointerDown(e, tab.id, i)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onLostPointerCapture={onPointerCancel}
            className={`group flex items-center gap-1 px-2.5 py-1 text-xs rounded-t-md border-b-2 transition-colors max-w-[180px] select-none ${
              isActive
                ? 'bg-bg border-b-accent text-fg font-medium'
                : 'bg-bg-panel border-b-transparent text-fg-muted hover:bg-bg-hover hover:text-fg'
            }`}
            onClick={() => {
              if (hasDraggedRef.current) return;
              if (!isActive) {
                if (isRepoTab) {
                  switchRepo.mutate(tab.repoPath);
                } else {
                  activateTab(tab.id);
                }
              }
            }}
            title={isRepoTab ? tab.repoPath : 'Dashboard'}
          >
            <span className="truncate">{name}</span>
            {!isRepoTab && <span className="text-[10px] uppercase tracking-wider text-fg-dim">Home</span>}
            <X
              className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-git-deleted rounded-sm"
              onClick={(e) => {
                e.stopPropagation();
                if (isRepoTab) {
                  closeRepo.mutate(tab.repoPath);
                } else {
                  useRepoStore.getState().closeTab(tab.id);
                }
              }}
            />
          </button>
        );
      })}
      <button
        className="flex items-center justify-center w-7 h-7 rounded-md text-fg-muted hover:bg-bg-hover hover:text-fg transition-colors shrink-0"
        onClick={() => openDashboardTab()}
        title="New dashboard tab"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}

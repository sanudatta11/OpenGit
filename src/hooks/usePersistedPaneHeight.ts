// Persist a vertical pane height with mouse-drag resize (composer / inspector splits).

import { useEffect, useRef, useState } from 'react';

export interface PersistedPaneHeightOptions {
  initial: number;
  min: number;
  /** When container height is known, max = container - reservedBelow. */
  reservedBelow: number;
  onPersist?: (height: number) => void;
}

export function usePersistedPaneHeight(opts: PersistedPaneHeightOptions) {
  const [height, setHeight] = useState(Math.max(opts.initial, opts.min));
  const [containerHeight, setContainerHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const heightRef = useRef(height);
  heightRef.current = height;

  useEffect(() => {
    setHeight(Math.max(opts.initial, opts.min));
  }, [opts.initial, opts.min]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const updateHeight = () => setContainerHeight(element.clientHeight);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const maxHeight = containerHeight > 0
    ? Math.max(opts.min, containerHeight - opts.reservedBelow)
    : opts.initial * 2;
  const clampedHeight = Math.min(Math.max(opts.min, height), maxHeight);
  heightRef.current = clampedHeight;

  useEffect(() => {
    if (height !== clampedHeight) setHeight(clampedHeight);
  }, [clampedHeight, height]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const handleMouseMove = (ev: MouseEvent) => {
      const nextHeight = rect.bottom - ev.clientY;
      const nextMax = Math.max(opts.min, rect.height - opts.reservedBelow);
      setHeight(Math.min(Math.max(opts.min, nextHeight), nextMax));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      opts.onPersist?.(Math.round(heightRef.current));
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  return {
    containerRef,
    height: clampedHeight,
    handleDragStart,
  };
}

// src/components/diff/DiffViewer.tsx — Monaco DiffEditor wrapper for git diffs.

import { useMemo } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

export type DiffView = 'side-by-side' | 'unified';

export interface DiffViewerProps {
  original: string;
  modified: string;
  language: string;
  view: DiffView;
  binary?: boolean;
  className?: string;
}

const THEME = 'opengit-dark';

export function DiffViewer({
  original,
  modified,
  language,
  view,
  binary,
  className,
}: DiffViewerProps) {
  const options = useMemo<editor.IDiffEditorConstructionOptions>(
    () => ({
      readOnly: true,
      originalEditable: false,
      renderSideBySide: view === 'side-by-side',
      renderMarginRevertIcon: false,
      enableSplitViewResizing: true,
      renderIndicators: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      fontSize: 13,
      lineNumbersMinChars: 4,
      glyphMargin: false,
      automaticLayout: true,
    }),
    [view],
  );

  if (binary) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center text-sm ${className ?? ''}`}
        style={{ background: '#0d1117', color: '#8b949e' }}
      >
        Binary file not shown
      </div>
    );
  }

  const identical = original === modified;

  return (
    <div className={`relative h-full w-full ${className ?? ''}`}>
      <DiffEditor
        key={view}
        theme={THEME}
        original={original}
        modified={modified}
        language={language}
        options={options}
        height="100%"
        width="100%"
        loading={
          <div style={{ background: '#0d1117', color: '#8b949e', height: '100%' }}>
            Loading diff…
          </div>
        }
      />
      {identical && (
        <div
          className="pointer-events-none absolute right-3 top-3 rounded px-2 py-1 text-xs"
          style={{ background: '#161b22', color: '#8b949e', border: '1px solid #262d3a' }}
        >
          No changes
        </div>
      )}
    </div>
  );
}

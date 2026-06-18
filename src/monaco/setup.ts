// src/monaco/setup.ts — offline Monaco bootstrap for Electron + Vite.
// Import ONCE at app startup (in main.tsx). Side-effectful.

import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

globalThis.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

monaco.editor.defineTheme('opengit-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'e6edf3', background: '0d1117' },
    { token: 'comment', foreground: '8b949e', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'ff7b72' },
    { token: 'string', foreground: 'a5d6ff' },
    { token: 'number', foreground: '79c0ff' },
    { token: 'type', foreground: 'ffa657' },
    { token: 'function', foreground: 'd2a8ff' },
    { token: 'variable', foreground: 'e6edf3' },
    { token: 'delimiter', foreground: '8b949e' },
  ],
  colors: {
    'editor.background': '#0d1117',
    'editor.foreground': '#e6edf3',
    'editorLineNumber.foreground': '#484f58',
    'editorLineNumber.activeForeground': '#8b949e',
    'editorGutter.background': '#0d1117',
    'editor.lineHighlightBackground': '#161b22',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#e6edf3',
    'editor.selectionBackground': '#264f78',
    'editor.inactiveSelectionBackground': '#3a3d41',
    'editorWhitespace.foreground': '#484f58',
    'editorIndentGuide.background': '#21262d',
    'editorIndentGuide.activeBackground': '#30363d',
    'editorWidget.background': '#161b22',
    'editorWidget.border': '#262d3a',
    'scrollbarSlider.background': '#30363d80',
    'scrollbarSlider.hoverBackground': '#484f58a0',
    'scrollbarSlider.activeBackground': '#6e7681a0',
    'diffEditor.insertedTextBackground': '#3fb95033',
    'diffEditor.insertedLineBackground': '#3fb9501a',
    'diffEditor.removedTextBackground': '#f8514933',
    'diffEditor.removedLineBackground': '#f851491a',
    'diffEditorGutter.insertedLineBackground': '#3fb9501a',
    'diffEditorGutter.removedLineBackground': '#f851491a',
    'diffEditor.border': '#262d3a',
    'diffEditor.diagonalFill': '#262d3a',
  },
});

export { monaco };

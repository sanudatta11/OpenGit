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

monaco.editor.defineTheme('opengit-light', {
  base: 'vs',
  inherit: true,
  rules: [
    { token: '', foreground: '1a1a2e', background: 'ffffff' },
    { token: 'comment', foreground: '57606a', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'cf222e' },
    { token: 'string', foreground: '0a3069' },
    { token: 'number', foreground: '0550ae' },
    { token: 'type', foreground: '9a6700' },
    { token: 'function', foreground: '8250df' },
    { token: 'variable', foreground: '1a1a2e' },
    { token: 'delimiter', foreground: '57606a' },
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#1a1a2e',
    'editorLineNumber.foreground': '#afb8c1',
    'editorLineNumber.activeForeground': '#57606a',
    'editorGutter.background': '#ffffff',
    'editor.lineHighlightBackground': '#f6f8fa',
    'editor.lineHighlightBorder': '#00000000',
    'editorCursor.foreground': '#1a1a2e',
    'editor.selectionBackground': '#ddf4ff',
    'editor.inactiveSelectionBackground': '#eaeef2',
    'editorWhitespace.foreground': '#afb8c1',
    'editorIndentGuide.background': '#eaeef2',
    'editorIndentGuide.activeBackground': '#d0d7de',
    'editorWidget.background': '#f6f8fa',
    'editorWidget.border': '#d0d7de',
    'scrollbarSlider.background': '#d0d7de80',
    'scrollbarSlider.hoverBackground': '#afb8c1a0',
    'scrollbarSlider.activeBackground': '#8b949ea0',
    'diffEditor.insertedTextBackground': '#1a7f3733',
    'diffEditor.insertedLineBackground': '#1a7f371a',
    'diffEditor.removedTextBackground': '#cf222e33',
    'diffEditor.removedLineBackground': '#cf222e1a',
    'diffEditorGutter.insertedLineBackground': '#1a7f371a',
    'diffEditorGutter.removedLineBackground': '#cf222e1a',
    'diffEditor.border': '#d0d7de',
    'diffEditor.diagonalFill': '#d0d7de',
  },
});

export { monaco };

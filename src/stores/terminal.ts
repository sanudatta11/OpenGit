// src/stores/terminal.ts — state management for the interactive terminal.
import { create } from 'zustand';

export interface TerminalLine {
  type: 'input' | 'output' | 'error' | 'info';
  text: string;
  promptText?: string;
}

interface TerminalStore {
  lines: TerminalLine[];
  history: string[];
  isRunning: boolean;
  addOutput: (text: string) => void;
  addError: (text: string) => void;
  addInputLine: (command: string, promptText: string) => void;
  addInfo: (text: string) => void;
  clear: () => void;
  setIsRunning: (running: boolean) => void;
}

export const useTerminalStore = create<TerminalStore>((set) => ({
  lines: [
    { type: 'info', text: 'Welcome to OpenGit Terminal. Run git or shell commands here.' }
  ],
  history: [],
  isRunning: false,
  addOutput: (text) => set((s) => {
    const len = s.lines.length;
    const last = len > 0 ? s.lines[len - 1] : undefined;
    if (last && last.type === 'output') {
      const updated = [...s.lines];
      updated[len - 1] = {
        type: 'output',
        text: last.text + text
      };
      return { lines: updated };
    }
    return { lines: [...s.lines, { type: 'output', text }] };
  }),
  addError: (text) => set((s) => {
    const len = s.lines.length;
    const last = len > 0 ? s.lines[len - 1] : undefined;
    if (last && last.type === 'error') {
      const updated = [...s.lines];
      updated[len - 1] = {
        type: 'error',
        text: last.text + text
      };
      return { lines: updated };
    }
    return { lines: [...s.lines, { type: 'error', text }] };
  }),
  addInputLine: (command, promptText) => set((s) => ({
    lines: [...s.lines, { type: 'input', text: command, promptText }],
    history: [...s.history.filter((h) => h !== command), command],
  })),
  addInfo: (text) => set((s) => ({
    lines: [...s.lines, { type: 'info', text }]
  })),
  clear: () => set({ lines: [] }),
  setIsRunning: (running) => set({ isRunning: running }),
}));

// src/components/LogDrawer.tsx — interactive terminal drawer replacing the operation log.
import { useEffect, useRef, useState } from 'react';
import { X, Terminal as TerminalIcon, Square } from 'lucide-react';
import { useRepoStore } from '../stores/repo';
import { useTerminalStore } from '../stores/terminal';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../ipc/api';

export function LogDrawer() {
  const toggle = useRepoStore((s) => s.toggleLogDrawer);
  const repo = useRepoStore((s) => s.repo);
  const qc = useQueryClient();

  const {
    lines,
    history,
    isRunning,
    addOutput,
    addError,
    addInputLine,
    addInfo,
    clear,
    setIsRunning,
  } = useTerminalStore();

  const [inputValue, setInputValue] = useState('');
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Automatically scroll to bottom on new output.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  // Handle stdout/stderr and exit events from the backend.
  useEffect(() => {
    const unsubData = api.terminal.onData((data) => {
      if (data.isError) {
        addError(data.text);
      } else {
        addOutput(data.text);
      }
    });

    const unsubExit = api.terminal.onExit((data) => {
      setIsRunning(false);
      addInfo(`Process exited with code ${data.exitCode}`);
      // Invalidate queries so that repository graph and file status sync immediately.
      void qc.invalidateQueries();
    });

    return () => {
      unsubData();
      unsubExit();
    };
  }, [addOutput, addError, addInfo, setIsRunning, qc]);

  // Prompt metadata
  const repoName = repo ? repo.path.split(/[/\\]/).pop() || 'repo' : 'OpenGit';
  const branchName = repo?.currentBranch ? ` (${repo.currentBranch})` : '';
  const promptString = `${repoName}${branchName} $`;

  const handleSubmit = async () => {
    const cmd = inputValue.trim();
    if (!cmd) return;

    if (cmd === 'clear') {
      clear();
      setInputValue('');
      setHistoryIndex(null);
      return;
    }

    addInputLine(cmd, promptString);
    setIsRunning(true);
    setInputValue('');
    setHistoryIndex(null);

    try {
      await api.terminal.run(cmd);
    } catch (err: any) {
      addError(err.message ?? String(err));
      setIsRunning(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      void handleSubmit();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      let nextIndex = historyIndex === null ? history.length - 1 : historyIndex - 1;
      if (nextIndex < 0) nextIndex = 0;
      setHistoryIndex(nextIndex);
      setInputValue(history[nextIndex] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (history.length === 0 || historyIndex === null) return;
      const nextIndex = historyIndex + 1;
      if (nextIndex >= history.length) {
        setHistoryIndex(null);
        setInputValue('');
      } else {
        setHistoryIndex(nextIndex);
        setInputValue(history[nextIndex] || '');
      }
    } else if (e.key === 'c' && e.ctrlKey) {
      if (isRunning) {
        e.preventDefault();
        void handleKill();
      }
    }
  };

  const handleKill = async () => {
    await api.terminal.kill();
    addInfo('Command terminated by user.');
    setIsRunning(false);
  };

  const focusInput = () => {
    inputRef.current?.focus();
  };

  return (
    <div className="h-64 border-t border-border bg-[#0a0a0a] text-[#d4d4d4] flex flex-col shrink-0 font-mono text-xs">
      {/* Header Bar */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-border bg-bg-panel shrink-0 select-none">
        <div className="flex items-center gap-2">
          <TerminalIcon className="w-3.5 h-3.5 text-accent" />
          <span className="font-semibold text-fg text-xs">Terminal</span>
          <span className="text-xxs text-fg-dim truncate max-w-[400px]" title={repo?.path ?? 'Home'}>
            {repo?.path ?? 'No open repository'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isRunning && (
            <button
              className="flex items-center gap-1 text-xxs px-2 py-0.5 rounded bg-git-deleted/20 hover:bg-git-deleted/30 text-git-deleted transition-colors border border-git-deleted/30"
              onClick={handleKill}
              title="Terminate running process (Ctrl+C)"
            >
              <Square className="w-2.5 h-2.5 fill-git-deleted" />
              <span>Kill</span>
            </button>
          )}
          <button
            className="text-xxs px-1.5 py-0.5 rounded text-fg-muted hover:bg-bg-hover transition-colors border border-border"
            onClick={clear}
            title="Clear output history"
          >
            Clear
          </button>
          <button className="icon-btn hover:text-fg" onClick={() => toggle(false)} title="Close terminal (Ctrl+L)">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Screen Log */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-1.5 cursor-text select-text"
        onClick={focusInput}
      >
        {lines.map((line, idx) => {
          if (line.type === 'info') {
            return (
              <div key={idx} className="text-fg-dim/70 text-xxs italic border-l-2 border-border/40 pl-2 py-0.5">
                {line.text}
              </div>
            );
          }
          if (line.type === 'input') {
            return (
              <div key={idx} className="flex items-start gap-2">
                <span className="text-git-added font-medium shrink-0">{line.promptText}</span>
                <span className="text-fg-light font-semibold">{line.text}</span>
              </div>
            );
          }
          if (line.type === 'error') {
            return (
              <pre key={idx} className="whitespace-pre-wrap text-git-deleted leading-relaxed select-text font-mono">
                {line.text}
              </pre>
            );
          }
          return (
            <pre key={idx} className="whitespace-pre-wrap text-[#c5c6c7] leading-relaxed select-text font-mono">
              {line.text}
            </pre>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* Input Line */}
      <div className="px-3 py-2 border-t border-border/30 bg-[#0f0f0f] flex items-center gap-2 shrink-0">
        <span className="flex items-center gap-1 text-git-added font-semibold shrink-0 select-none">
          {repoName}
          {repo?.currentBranch && (
            <span className="text-git-branch font-normal">({repo.currentBranch})</span>
          )}
          <span className="text-fg-dim font-normal ml-1">$</span>
        </span>
        <input
          ref={inputRef}
          className="flex-1 bg-transparent outline-none text-[#ffffff] font-mono text-xs border-none p-0 caret-accent"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          autoFocus
          placeholder={isRunning ? "Process is running..." : "Type command here..."}
          disabled={isRunning}
        />
      </div>
    </div>
  );
}

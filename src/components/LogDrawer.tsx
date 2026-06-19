// src/components/LogDrawer.tsx — interactive terminal drawer replacing the operation log.
import { useEffect, useRef, useState } from 'react';
import { X, Terminal as TerminalIcon, Square, ScrollText } from 'lucide-react';
import { useRepoStore } from '../stores/repo';
import { useTerminalStore } from '../stores/terminal';
import { useLogStore } from '../stores/log';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../ipc/api';

export function LogDrawer() {
  const toggle = useRepoStore((s) => s.toggleLogDrawer);
  const repo = useRepoStore((s) => s.activeRepo);
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
  const [viewMode, setViewMode] = useState<'terminal' | 'log'>('terminal');

  const logEntries = useLogStore((s) => s.entries);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Automatically scroll to bottom on new output.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines, logEntries]);

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
    <div className="h-64 border-t border-border bg-bg text-fg flex flex-col shrink-0 font-mono text-xs">
      {/* Header Bar */}
      <div className="h-9 px-3 flex items-center justify-between border-b border-border bg-bg-panel shrink-0 select-none">
        <div className="flex items-center gap-2">
          <button
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${viewMode === 'terminal' ? 'bg-accent/15 text-accent border-accent/30' : 'text-fg-muted border-transparent hover:bg-bg-hover'}`}
            onClick={() => setViewMode('terminal')}
          >
            <TerminalIcon className="w-3 h-3 inline mr-1" />
            Terminal
          </button>
          <button
            className={`text-xs px-2 py-0.5 rounded border transition-colors ${viewMode === 'log' ? 'bg-accent/15 text-accent border-accent/30' : 'text-fg-muted border-transparent hover:bg-bg-hover'}`}
            onClick={() => setViewMode('log')}
          >
            <ScrollText className="w-3 h-3 inline mr-1" />
            Log
          </button>
        </div>

        <div className="flex items-center gap-2">
          {viewMode === 'terminal' && isRunning && (
            <button
              className="flex items-center gap-1 text-xxs px-2 py-0.5 rounded bg-git-deleted/20 hover:bg-git-deleted/30 text-git-deleted transition-colors border border-git-deleted/30"
              onClick={handleKill}
              title="Terminate running process (Ctrl+C)"
            >
              <Square className="w-2.5 h-2.5 fill-git-deleted" />
              <span>Kill</span>
            </button>
          )}
          {viewMode === 'terminal' && (
            <button
              className="text-xxs px-1.5 py-0.5 rounded text-fg-muted hover:bg-bg-hover transition-colors border border-border"
              onClick={clear}
              title="Clear output history"
            >
              Clear
            </button>
          )}
          <button className="icon-btn hover:text-fg" onClick={() => toggle(false)} title="Close terminal (Ctrl+L)">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {viewMode === 'log' ? (
        /* Operation Log */
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 select-text">
          {logEntries.length === 0 && (
            <div className="text-fg-dim text-xs text-center py-4">No operation log entries yet.</div>
          )}
          {[...logEntries].reverse().map((entry) => (
            <div key={entry.id} className="flex items-start gap-2 text-xxs py-0.5 border-b border-border/20">
              <span className={`shrink-0 mt-0.5 ${entry.ok ? 'text-git-added' : 'text-git-deleted'}`}>
                {entry.ok ? '✓' : '✗'}
              </span>
              <span className="text-fg-dim shrink-0 w-16 font-mono">
                {new Date(entry.ts).toLocaleTimeString()}
              </span>
              <span className="text-accent shrink-0 w-20 font-mono truncate" title={entry.channel}>
                {entry.channel}
              </span>
              <span className="text-fg font-mono flex-1 min-w-0 truncate" title={entry.argv.join(' ')}>
                {entry.argv.join(' ')}
              </span>
              <span className="text-fg-dim shrink-0">
                {entry.durationMs}ms
                {entry.exitCode !== null && ` (${entry.exitCode})`}
              </span>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      ) : (
        <>
          {/* Terminal Screen Log */}
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
                <pre key={idx} className="whitespace-pre-wrap leading-relaxed select-text font-mono">
                  {line.text}
                </pre>
              );
            })}
            <div ref={endRef} />
          </div>

          {/* Input Line */}
          <div className="px-3 py-2 border-t border-border/30 bg-bg-elevated flex items-center gap-2 shrink-0">
            <span className="flex items-center gap-1 text-git-added font-semibold shrink-0 select-none">
              {repoName}
              {repo?.currentBranch && (
                <span className="text-git-branch font-normal">({repo.currentBranch})</span>
              )}
              <span className="text-fg-dim font-normal ml-1">$</span>
            </span>
            <input
              ref={inputRef}
              className="flex-1 bg-transparent outline-none text-fg font-mono text-xs border-none p-0 caret-accent"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              placeholder={isRunning ? "Process is running..." : "Type command here..."}
              disabled={isRunning}
            />
          </div>
        </>
      )}
    </div>
  );
}

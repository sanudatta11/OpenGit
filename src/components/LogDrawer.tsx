// src/components/LogDrawer.tsx — bottom drawer showing recent git operations with filter + copy.

import { useEffect, useRef, useState } from 'react';
import { X, Terminal, Check, X as XIcon, Copy, Filter } from 'lucide-react';
import { useRepoStore } from '../stores/repo';
import { useLogStore } from '../stores/log';
import type { LogEntry } from '@shared/git';

type FilterKind = 'all' | 'ok' | 'error';

export function LogDrawer() {
  const toggle = useRepoStore((s) => s.toggleLogDrawer);
  const entries = useLogStore((s) => s.entries);
  const clear = useLogStore((s) => s.clear);
  const [filter, setFilter] = useState<FilterKind>('all');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [entries.length]);

  const filtered = filter === 'all' ? entries : entries.filter((e) => filter === 'ok' ? e.ok : !e.ok);

  return (
    <div className="h-56 border-t border-border bg-bg-panel flex flex-col shrink-0">
      <div className="h-8 px-3 flex items-center justify-between border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-fg-muted" />
          <span className="label">Operation log</span>
          <span className="text-xxs text-fg-dim">{filtered.length}/{entries.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5">
            <Filter className="w-3 h-3 text-fg-dim" />
            {(['all', 'ok', 'error'] as const).map((f) => (
              <button
                key={f}
                className={`text-xxs px-1.5 py-0.5 rounded ${filter === f ? 'bg-accent/20 text-accent' : 'text-fg-muted hover:bg-bg-hover'}`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : f === 'ok' ? 'OK' : 'Errors'}
              </button>
            ))}
          </div>
          <button className="icon-btn" onClick={clear} title="Clear log">
            <span className="text-xxs">clear</span>
          </button>
          <button className="icon-btn" onClick={() => toggle(false)} title="Close (Ctrl/Cmd+L)">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-xxs">
        {filtered.length === 0 ? (
          <div className="p-3 text-fg-dim">{entries.length === 0 ? 'No git operations yet.' : 'No entries match filter.'}</div>
        ) : (
          filtered.map((e) => <LogRow key={e.id} entry={e} />)
        )}
        <div ref={endRef} />
      </div>
    </div>
  );
}

function LogRow({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const ts = new Date(entry.ts).toLocaleTimeString();
  const cmd = entry.argv.join(' ');

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    void navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    });
  };

  return (
    <div
      className="px-3 py-0.5 border-b border-border-subtle/30 hover:bg-bg-hover cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start gap-2">
        <span className="text-fg-dim shrink-0">{ts}</span>
        {entry.ok ? (
          <Check className="w-3 h-3 text-git-added shrink-0 mt-0.5" />
        ) : (
          <XIcon className="w-3 h-3 text-git-deleted shrink-0 mt-0.5" />
        )}
        <span className="text-fg-muted shrink-0 w-28 truncate">{entry.channel}</span>
        <span className="text-fg flex-1 truncate" title={cmd}>{cmd}</span>
        <button className="icon-btn !w-4 !h-4 opacity-50 hover:opacity-100" onClick={handleCopy} title="Copy command">
          {copied ? <Check className="w-2.5 h-2.5 text-git-added" /> : <Copy className="w-2.5 h-2.5" />}
        </button>
        <span className="text-fg-dim shrink-0">{entry.durationMs}ms</span>
        {entry.exitCode !== null && entry.exitCode !== 0 && (
          <span className="text-git-deleted shrink-0">exit {entry.exitCode}</span>
        )}
      </div>
      {expanded && (entry.stdout || entry.stderr) && (
        <div className="mt-1 ml-10 mb-1 space-y-1">
          {entry.stdout && (
            <pre className="text-fg-muted whitespace-pre-wrap overflow-x-auto max-h-32">{entry.stdout.slice(0, 2000)}</pre>
          )}
          {entry.stderr && (
            <pre className="text-git-deleted/80 whitespace-pre-wrap overflow-x-auto max-h-32">{entry.stderr.slice(0, 2000)}</pre>
          )}
        </div>
      )}
    </div>
  );
}

// src/components/CommandPalette.tsx — Ctrl+K command palette with deterministic matching.

import { useEffect, useMemo, useState } from 'react';
import { GitBranch, GitMerge, GitPullRequest, Search, Settings, Terminal, Upload, X } from 'lucide-react';
import { useBranches } from '../queries/useRepo';
import { useCheckout, useFetch, useMerge, usePull, usePush, useStashCreate } from '../queries/useMutations';
import { useRepoStore } from '../stores/repo';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenRepository: () => void;
  onOpenSettings: () => void;
}

interface Command {
  id: string;
  label: string;
  detail: string;
  icon: typeof Search;
  run: () => void;
  aliases: readonly string[];
}

export function CommandPalette({ open, onClose, onOpenRepository, onOpenSettings }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const branches = useBranches();
  const checkout = useCheckout();
  const fetch_ = useFetch();
  const pull = usePull();
  const push = usePush();
  const stash = useStashCreate();
  const toggleLogDrawer = useRepoStore((s) => s.toggleLogDrawer);
  const mergeMutation = useMerge();

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const base: Command[] = [
      { id: 'open', label: 'Open Repository', detail: 'Choose a local repository', icon: Search, run: onOpenRepository, aliases: ['open repo', 'open repository'] },
      { id: 'fetch', label: 'Fetch', detail: 'Fetch origin with prune', icon: GitPullRequest, run: () => fetch_.mutate({ remote: 'origin', prune: true }), aliases: ['fetch', 'sync'] },
      { id: 'pull', label: 'Pull Current Branch', detail: 'Pull origin using merge', icon: GitPullRequest, run: () => pull.mutate({ remote: 'origin', strategy: 'merge' } as never), aliases: ['pull', 'pull current branch'] },
      { id: 'push', label: 'Push Current Branch', detail: 'Push origin', icon: Upload, run: () => push.mutate({ remote: 'origin' }), aliases: ['push', 'push current branch'] },
      { id: 'stash', label: 'Stash Changes', detail: 'Create a default stash', icon: GitBranch, run: () => stash.mutate({}), aliases: ['stash', 'stash changes'] },
      { id: 'terminal', label: 'Show Terminal', detail: 'Toggle interactive terminal', icon: Terminal, run: () => toggleLogDrawer(true), aliases: ['terminal', 'console', 'show terminal', 'command prompt'] },
      { id: 'settings', label: 'Open Settings', detail: 'Preferences and Git path', icon: Settings, run: onOpenSettings, aliases: ['settings', 'open settings'] },
    ];
    for (const branch of branches.data ?? []) {
      if (branch.kind !== 'local') continue;
      base.push({
        id: `checkout:${branch.shortName}`,
        label: `Checkout ${branch.shortName}`,
        detail: branch.upstream ?? 'Local branch',
        icon: GitBranch,
        run: () => checkout.mutate({ ref: branch.shortName }),
        aliases: [`checkout ${branch.shortName}`, `switch ${branch.shortName}`],
      });
      base.push({
        id: `merge:${branch.shortName}`,
        label: `Merge ${branch.shortName} into current branch`,
        detail: 'Preview available from operation panel',
        icon: GitMerge,
        run: () => mergeMutation.mutate({ ref: branch.shortName }),
        aliases: [`merge ${branch.shortName}`, `merge ${branch.shortName} into current branch`],
      });
    }
    return base;
  }, [branches.data, checkout, fetch_, mergeMutation, onOpenRepository, onOpenSettings, pull, push, stash, toggleLogDrawer]);

  const ranked = useMemo(() => rankCommands(commands, query).slice(0, 8), [commands, query]);

  if (!open) return null;

  const run = (command: Command) => {
    command.run();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-[12vh]" onMouseDown={onClose}>
      <div className="w-[620px] max-w-[calc(100vw-32px)] rounded-lg border border-border bg-bg-panel shadow-2xl overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="h-11 flex items-center gap-2 px-3 border-b border-border">
          <Search className="w-4 h-4 text-fg-muted" />
          <input
            className="flex-1 bg-transparent outline-none text-sm text-fg"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && ranked[0]) run(ranked[0]);
            }}
            autoFocus
            placeholder="Type a command or phrase"
          />
          <button className="icon-btn" onClick={onClose} title="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="py-1 max-h-[360px] overflow-y-auto">
          {ranked.map((command) => {
            const Icon = command.icon;
            return (
              <button key={command.id} className="w-full px-3 py-2 flex items-center gap-3 text-left hover:bg-bg-hover" onClick={() => run(command)}>
                <Icon className="w-4 h-4 text-accent shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-fg truncate">{command.label}</span>
                  <span className="block text-xs text-fg-muted truncate">{command.detail}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function rankCommands(commands: readonly Command[], query: string): Command[] {
  const q = normalize(query);
  if (!q) return [...commands];
  return commands
    .map((command) => ({ command, score: scoreCommand(command, q) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label))
    .map((item) => item.command);
}

function scoreCommand(command: Command, query: string): number {
  const haystacks = [command.label, command.detail, ...command.aliases].map(normalize);
  let best = 0;
  for (const haystack of haystacks) {
    if (haystack === query) best = Math.max(best, 100);
    else if (haystack.startsWith(query)) best = Math.max(best, 80);
    else if (haystack.includes(query)) best = Math.max(best, 60);
    else if (query.split(/\s+/).every((part) => haystack.includes(part))) best = Math.max(best, 40);
  }
  return best;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9/_-]+/g, ' ').trim();
}

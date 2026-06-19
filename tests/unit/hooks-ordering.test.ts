// tests/unit/hooks-ordering.test.ts — static analysis: catches React hooks called
// after conditional early returns (Rules of Hooks violation).
//
// This prevents regressions like the WorkingTree.tsx bug where useRepoStore
// was called after `if (status.isLoading) return`, causing "Rendered more hooks
// than during the previous render" at runtime.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_DIR = join(__dirname, '../../src');

function findTsxFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'out') continue;
      results.push(...findTsxFiles(full));
    } else if (entry.endsWith('.tsx') && !entry.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

const HOOK_RE = /^const\s+\[.*\]\s*=\s*(use\w+)\(/;
const HOOK_RE2 = /^(?:const\s+\w+\s*=\s*)?(use\w+)\(/;
const COMPONENT_FN_RE = /(?:export\s+)?(?:function|const)\s+[A-Z]\w*/;
// Matches useEffect/useMemo/useCallback opening — we skip returns inside these.
const CALLBACK_HOOK_RE = /\b(useEffect|useMemo|useCallback)\s*\(/;

/**
 * Check a component file for the anti-pattern:
 * A hook call appearing AFTER a conditional return at the component's top-level scope.
 *
 * Returns the first offending hook name, or null if clean.
 */
function findHookAfterEarlyReturn(source: string): { hookName: string; line: number } | null {
  const lines = source.split('\n');

  let braceDepth = 0;
  let inComponent = false;
  let componentStartDepth = 0;
  let callbackDepth = 0; // tracks nesting inside useEffect/useMemo/useCallback bodies

  // Track seen early returns: set of brace depths where we saw `if (...) return`
  const earlyReturnDepths = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();

    // Count braces (naive but sufficient for well-formatted TSX)
    for (const ch of line) {
      if (ch === '{') {
        braceDepth++;
        // Detect opening of useEffect/useMemo/useCallback callback body
        if (CALLBACK_HOOK_RE.test(line)) {
          callbackDepth = braceDepth;
        }
      }
      if (ch === '}') {
        braceDepth--;
        // Closing the callback body
        if (callbackDepth > 0 && braceDepth < callbackDepth) {
          callbackDepth = 0;
        }
      }
    }

    // Detect component function start (uppercase = React component)
    if (!inComponent && COMPONENT_FN_RE.test(trimmed)) {
      inComponent = true;
      componentStartDepth = braceDepth - 1;
    }

    if (!inComponent) continue;

    // Skip: we're inside a useEffect/useMemo/useCallback body — returns here are fine
    if (callbackDepth > 0) continue;

    // Detect conditional early return at the component's top-level scope
    // Pattern: `if (...) { return` or `if (...) return` or `if (...)\n  return`
    if (braceDepth <= componentStartDepth + 1 && /^\s*if\s*\(/.test(line) && /\breturn\b/.test(trimmed)) {
      earlyReturnDepths.add(braceDepth);
    }

    // After we've seen an early return at some depth, any hook call at the SAME
    // or shallower brace depth (within the component body) is a violation.
    if (earlyReturnDepths.size > 0 && braceDepth <= componentStartDepth + 2) {
      for (const retDepth of earlyReturnDepths) {
        if (braceDepth <= retDepth) {
          const hookMatch = trimmed.match(HOOK_RE) || trimmed.match(HOOK_RE2);
          if (hookMatch && hookMatch[1]) {
            // Filter out non-hook "use" functions (e.g., useRef is a hook, but not "useCallback" in a non-hook position)
            const name = hookMatch[1];
            if (/^use[A-Z]/.test(name)) {
              return { hookName: name, line: i + 1 };
            }
          }
          break;
        }
      }
    }

    // End of component
    if (inComponent && braceDepth <= componentStartDepth) {
      inComponent = false;
      earlyReturnDepths.clear();
      callbackDepth = 0;
    }
  }

  return null;
}

describe('hooks ordering — static analysis', () => {
  const files = findTsxFiles(SRC_DIR);

  for (const file of files) {
    const rel = relative(SRC_DIR, file);
    it(`${rel} has no hooks after early returns`, () => {
      const source = readFileSync(file, 'utf8');
      const violation = findHookAfterEarlyReturn(source);
      if (violation) {
        expect.fail(
          `Hook "${violation.hookName}" at line ${violation.line} is called after ` +
          'a conditional early return. This violates Rules of Hooks and causes ' +
          '"Rendered more hooks than during the previous render" at runtime.'
        );
      }
    });
  }
});

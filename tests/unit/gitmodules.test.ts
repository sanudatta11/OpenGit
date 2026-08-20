import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGitmodulesUrls } from '../../electron/main/git/operations/remotes';

describe('parseGitmodulesUrls', () => {
  it('maps submodule paths to urls', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opengit-gitmodules-'));
    try {
      writeFileSync(join(dir, '.gitmodules'), `
[submodule "libs/submodule-lib"]
\tpath = libs/submodule-lib
\turl = ../submodule-lib
[submodule "vendor/other"]
\tpath = vendor/other
\turl = https://example.com/other.git
`);
      const urls = parseGitmodulesUrls(dir);
      expect(urls.get('libs/submodule-lib')).toBe('../submodule-lib');
      expect(urls.get('vendor/other')).toBe('https://example.com/other.git');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns an empty map when .gitmodules is missing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'opengit-nogitmodules-'));
    try {
      expect(parseGitmodulesUrls(dir).size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

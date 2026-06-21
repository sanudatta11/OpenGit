import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { getLog } from '../../electron/main/git/repo';

function git(cwd: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_PAGER: 'cat', LC_ALL: 'C', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.autocrlf', GIT_CONFIG_VALUE_0: 'false', ...env },
  });
}

describe('getLog topo ordering', () => {
  it('matches git log --topo-order when commit dates would otherwise interleave branches', async () => {
    const repoDir = mkdtempSync(join(tmpdir(), 'opengit-log-order-'));

    try {
      git(repoDir, ['init', '-q', '-b', 'main']);
      git(repoDir, ['config', 'user.email', 't@t.co']);
      git(repoDir, ['config', 'user.name', 'Test']);

      writeFileSync(join(repoDir, 'history.txt'), 'A\n');
      git(repoDir, ['add', '.']);
      git(repoDir, ['commit', '-q', '-m', 'A'], {
        GIT_AUTHOR_DATE: '2024-01-01T00:00:00Z',
        GIT_COMMITTER_DATE: '2024-01-01T00:00:00Z',
      });

      git(repoDir, ['checkout', '-q', '-b', 'feature']);
      writeFileSync(join(repoDir, 'history.txt'), 'A\nF1\n');
      git(repoDir, ['add', '.']);
      git(repoDir, ['commit', '-q', '-m', 'F1'], {
        GIT_AUTHOR_DATE: '2024-01-02T00:00:00Z',
        GIT_COMMITTER_DATE: '2024-01-02T00:00:00Z',
      });

      writeFileSync(join(repoDir, 'history.txt'), 'A\nF1\nF2\n');
      git(repoDir, ['add', '.']);
      git(repoDir, ['commit', '-q', '-m', 'F2'], {
        GIT_AUTHOR_DATE: '2024-01-05T00:00:00Z',
        GIT_COMMITTER_DATE: '2024-01-05T00:00:00Z',
      });

      git(repoDir, ['checkout', '-q', 'main']);
      writeFileSync(join(repoDir, 'history.txt'), 'A\nB\n');
      git(repoDir, ['add', '.']);
      git(repoDir, ['commit', '-q', '-m', 'B'], {
        GIT_AUTHOR_DATE: '2024-01-03T00:00:00Z',
        GIT_COMMITTER_DATE: '2024-01-03T00:00:00Z',
      });

      writeFileSync(join(repoDir, 'history.txt'), 'A\nB\nC\n');
      git(repoDir, ['add', '.']);
      git(repoDir, ['commit', '-q', '-m', 'C'], {
        GIT_AUTHOR_DATE: '2024-01-04T00:00:00Z',
        GIT_COMMITTER_DATE: '2024-01-04T00:00:00Z',
      });

      const expected = git(repoDir, ['log', '--topo-order', '--pretty=format:%s', '--all'])
        .trim()
        .split('\n');

      const result = await getLog(repoDir, { skip: 0, limit: 10, refsBySha: new Map() });

      expect(result.commits.map((commit) => commit.subject)).toEqual(expected);
      expect(result.commits.map((commit) => commit.subject)).toEqual(['F2', 'F1', 'C', 'B', 'A']);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});

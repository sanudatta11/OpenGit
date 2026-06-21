// tests/integration/submodules.test.ts — A.11 Submodule operations.
// Uses the full fixture repo.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  setupTestRepo, cleanupTestRepo, createQuickRepo, destroyQuickRepo,
  type TestRepo,
} from './helpers';
import { listSubmodules, initSubmodules, deinitSubmodule } from '../../electron/main/git/operations';

let repo: TestRepo;

beforeAll(async () => {
  repo = await setupTestRepo();
}, 60_000);

afterAll(() => {
  cleanupTestRepo(repo.root);
});

describe('submodules', () => {
  it('A.11.1 lists the submodule', async () => {
    const subs = await listSubmodules(repo.main);
    expect(subs.length).toBe(1);
    expect(subs[0]!.path).toBe('libs/submodule-lib');
    expect(subs[0]!.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('A.11.2 initializes the submodule', async () => {
    const r = await initSubmodules(repo.main, false);
    expect(r.success).toBe(true);
  });

  it('A.11.3 deinitializes the submodule', async () => {
    // First init, then deinit.
    // Use force=true because Windows may have read-only .git files
    // in the submodule that prevent non-forced deinit.
    await initSubmodules(repo.main, false);
    const r = await deinitSubmodule(repo.main, 'libs/submodule-lib', true);
    expect(r.success).toBe(true);
  });

  it('A.11.4 returns empty list when no submodules exist', async () => {
    const qr = createQuickRepo();
    try {
      const subs = await listSubmodules(qr.workTree);
      expect(subs.length).toBe(0);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

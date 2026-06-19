// tests/integration/perf.test.ts — E.1–E.7 Performance thresholds.
// Run with OPENGIT_PERF=1 to enable these tests.
// Uses the full fixture repo (with --large) or lightweight repos.

import { describe, it, expect } from 'vitest';
import { performance } from 'node:perf_hooks';
import {
  createQuickRepo, destroyQuickRepo,
} from './helpers';
import { getLog, getStatus } from '../../electron/main/git/repo';
import { getBranches } from '../../electron/main/git/repo';
import { createCommit, stagePaths } from '../../electron/main/git/operations';

const PERF_ENABLED = !!process.env.OPENGIT_PERF;
const itPerf = PERF_ENABLED ? it : it.skip;

describe('performance thresholds', () => {
  itPerf('E.1 getLog first 100 commits < 150ms', async () => {
    const qr = createQuickRepo();
    try {
      const start = performance.now();
      const r = await getLog(qr.workTree, { skip: 0, limit: 100, refsBySha: new Map() });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(150);
      expect(r.commits.length).toBeGreaterThan(0);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  itPerf('E.3 getBranches < 80ms', async () => {
    const qr = createQuickRepo();
    try {
      const start = performance.now();
      const r = await getBranches(qr.workTree, require('node:path').join(qr.workTree, '.git'));
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(80);
      expect(r.branches.length).toBeGreaterThan(0);
    } finally {
      destroyQuickRepo(qr);
    }
  });

  itPerf('E.4 getStatus on clean tree < 250ms', async () => {
    const qr = createQuickRepo();
    try {
      const start = performance.now();
      const r = await getStatus(qr.workTree, require('node:path').join(qr.workTree, '.git'));
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(250);
      expect(r).toBeDefined();
    } finally {
      destroyQuickRepo(qr);
    }
  });

  itPerf('E.6 createCommit < 120ms', async () => {
    const qr = createQuickRepo();
    try {
      const { workTree } = qr;
      require('fs').writeFileSync(require('path').join(workTree, 'perf.txt'), 'perf\n');
      await stagePaths(workTree, ['perf.txt']);

      const start = performance.now();
      const r = await createCommit(workTree, { message: 'perf test' });
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(120);
      expect(r.success).toBe(true);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

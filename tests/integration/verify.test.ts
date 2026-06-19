// tests/integration/verify.test.ts — A.24 GPG verify tests.
// Most tests are unconditional (unsigned commits); signed tests skip if gpg unavailable.

import { describe, it, expect } from 'vitest';
import { verifyCommit } from '../../electron/main/git/operations';
import { createQuickRepo, destroyQuickRepo } from './helpers';

describe('verifyCommit', () => {
  it('A.24.2 returns unverified for an unsigned commit', async () => {
    const qr = createQuickRepo();
    try {
      const r = await verifyCommit(qr.workTree, 'HEAD');
      expect(r.verified).toBe(false);
      expect(r.signer).toBe('');
    } finally {
      destroyQuickRepo(qr);
    }
  });

  it('A.24.3 handles nonexistent sha gracefully', async () => {
    const qr = createQuickRepo();
    try {
      const r = await verifyCommit(qr.workTree, '0000000000000000000000000000000000000000');
      expect(r.verified).toBe(false);
    } finally {
      destroyQuickRepo(qr);
    }
  });
});

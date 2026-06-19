// electron/main/ipc/auth.ts — authentication and credential helper handlers.

import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc';
import { gitRun } from '../git/client';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

export function registerAuthHandlers(): void {
  ipcMain.handle(IPC.AUTH_STATUS, async () => {
    const credentials: { type: string; exists: boolean; path?: string }[] = [];

    // Check SSH keys
    const sshDir = join(homedir(), '.ssh');
    const sshKeys = ['id_rsa', 'id_ed25519', 'id_ecdsa', 'id_dsa'];
    for (const key of sshKeys) {
      const keyPath = join(sshDir, key);
      if (existsSync(keyPath)) {
        credentials.push({ type: 'ssh', exists: true, path: keyPath });
      }
    }
    if (credentials.every((c) => c.type !== 'ssh')) {
      credentials.push({ type: 'ssh', exists: false });
    }

    // Check git credential helper config
    const helperStatus: string[] = [];
    try {
      const r = await gitRun({
        cwd: homedir(),
        args: ['config', '--global', '--get-all', 'credential.helper'],
        channel: 'auth:status',
        reject: false,
      });
      if (r.ok && r.stdout.trim()) {
        helperStatus.push(...r.stdout.trim().split('\n').filter(Boolean));
      }
    } catch {
      // no credential helper configured
    }

    return { credentials, credentialHelpers: helperStatus };
  });

  ipcMain.handle(IPC.AUTH_TEST_REMOTE, async (_e, raw) => {
    const { url } = raw as { url: string } || {};
    if (!url) {
      return { success: false, message: 'No remote URL provided.' };
    }

    const r = await gitRun({
      cwd: homedir(),
      args: ['ls-remote', '--heads', url],
      channel: 'auth:testRemote',
      reject: false,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    });

    return {
      success: r.ok,
      message: r.ok ? 'Authentication successful' : (r.stderr || r.stdout || 'Authentication failed'),
    };
  });
}

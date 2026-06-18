// electron/main/ipc/terminal.ts — interactive terminal handlers.
import { ipcMain } from 'electron';
import { execa } from 'execa';
import { IPC } from '@shared/ipc';
import { getCurrentRepo } from '../git/session';
import { homedir } from 'os';

let activeChild: any = null;

export function registerTerminalHandlers(): void {
  ipcMain.handle(IPC.TERMINAL_RUN, async (e, command: string) => {
    if (activeChild) {
      try {
        activeChild.kill('SIGINT');
      } catch {}
      activeChild = null;
    }

    const repo = getCurrentRepo();
    const cwd = repo ? repo.workTreeRoot : homedir();
    const webContents = e.sender;

    try {
      activeChild = execa(command, {
        shell: true,
        cwd,
        reject: false,
        encoding: 'utf8',
        env: {
          ...process.env,
          FORCE_COLOR: '1',
          LC_ALL: 'C.UTF-8',
        },
      });

      activeChild.stdout?.on('data', (chunk: any) => {
        const text = chunk.toString();
        if (!webContents.isDestroyed()) {
          webContents.send('terminal:data', { text, isError: false });
        }
      });

      activeChild.stderr?.on('data', (chunk: any) => {
        const text = chunk.toString();
        if (!webContents.isDestroyed()) {
          webContents.send('terminal:data', { text, isError: true });
        }
      });

      const result = await activeChild;
      activeChild = null;

      if (!webContents.isDestroyed()) {
        webContents.send('terminal:exit', { exitCode: result.exitCode });
      }

      return { exitCode: result.exitCode ?? 0 };
    } catch (err: any) {
      activeChild = null;
      const msg = err.message ?? String(err);
      if (!webContents.isDestroyed()) {
        webContents.send('terminal:data', { text: `\nError executing command: ${msg}\n` });
        webContents.send('terminal:exit', { exitCode: -1 });
      }
      return { exitCode: -1 };
    }
  });

  ipcMain.handle(IPC.TERMINAL_KILL, async () => {
    if (activeChild) {
      try {
        activeChild.kill('SIGINT');
      } catch {}
      activeChild = null;
      return { success: true };
    }
    return { success: false };
  });
}

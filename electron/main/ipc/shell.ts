// electron/main/ipc/shell.ts — shell IPC handler (open in file manager, etc.).

import { ipcMain, shell } from 'electron';
import { IPC, ShellOpenPathInput, GitError } from '@shared/ipc';

export function registerShellHandlers(): void {
  ipcMain.handle(IPC.SHELL_OPEN_PATH, async (_e, raw) => {
    const parsed = ShellOpenPathInput.safeParse(raw);
    if (!parsed.success) {
      throw new GitError({
        code: 'BadInput',
        message: parsed.error.message,
        stdout: '',
        stderr: '',
        friendly: 'Invalid path.',
      });
    }
    const error = await shell.openPath(parsed.data.path);
    if (error) {
      throw new GitError({
        code: 'GitFailed',
        message: error,
        stdout: '',
        stderr: '',
        friendly: `Failed to open: ${error}`,
      });
    }
    return { success: true };
  });

  ipcMain.handle(IPC.SHELL_SHOW_ITEM_IN_FOLDER, async (_e, raw) => {
    const { filePath } = require('zod').z.object({ filePath: require('zod').z.string() }).parse(raw);
    shell.showItemInFolder(filePath);
    return { success: true };
  });
}

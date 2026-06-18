// electron/main/ipc/index.ts — register all IPC handlers in one place.

import { registerRepoHandlers } from './repo';
import { registerLogHandlers } from './log';
import { registerDiffHandlers } from './diff';
import { registerWorkingTreeHandlers } from './workingTree';
import { registerCommitHandlers } from './commit';
import { registerBranchHandlers } from './branch';
import { registerRemoteHandlers } from './remote';
import { registerStashHandlers } from './stash';
import { registerOperationsHandlers } from './operations';
import { registerWorktreeHandlers } from './worktree';
import { registerSettingsHandlers } from './settings';

export function registerAllHandlers(): void {
  registerRepoHandlers();
  registerDiffHandlers();
  registerWorkingTreeHandlers();
  registerCommitHandlers();
  registerBranchHandlers();
  registerRemoteHandlers();
  registerStashHandlers();
  registerOperationsHandlers();
  registerWorktreeHandlers();
  registerSettingsHandlers();
  registerLogHandlers();
}

// Stable public surface for git write operations.
// Domain implementations live in ./operations to keep IPC imports unchanged.

export * from './operations/workingTree';
export * from './operations/commits';
export * from './operations/refs';
export * from './operations/remotes';
export * from './operations/stash';
export { probeState } from './operations/state';

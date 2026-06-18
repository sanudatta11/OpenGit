// tests/setup.ts — initialize git binary before tests run.

import { discoverGitBin } from '../electron/main/git/client';

let initialized = false;

export async function setup(): Promise<void> {
  if (initialized) return;
  await discoverGitBin();
  initialized = true;
}

// Vitest globalSetup — runs once before all test files.
export default function globalSetup(): Promise<void> {
  return setup();
}

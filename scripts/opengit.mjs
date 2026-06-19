#!/usr/bin/env node

// scripts/opengit.mjs — CLI entry point for OpenGit.
// Usage: opengit [/path/to/repo]  (defaults to cwd)
// Validates .git exists, spawns Electron with --opengit-repo flag.

import { resolve, existsSync } from 'node:path';
import { spawn } from 'node:child_process';

const arg = process.argv[2];
const target = resolve(arg ?? process.cwd());

if (!existsSync(target)) {
  console.error(`opengit: path does not exist: ${target}`);
  process.exit(1);
}

if (!existsSync(resolve(target, '.git'))) {
  console.error(`opengit: not a git repository (no .git directory): ${target}`);
  process.exit(1);
}

// Detect Electron binary location.
function findElectron() {
  // Dev: electron-vite dev — run from project root via npx electron .
  const projectRoot = resolve(import.meta.dirname, '..');

  // Check if we're in the project (node_modules present)
  if (existsSync(resolve(projectRoot, 'node_modules/.bin/electron'))) {
    return {
      electron: resolve(projectRoot, 'node_modules/.bin/electron'),
      args: [projectRoot],
      cwd: projectRoot,
    };
  }

  // Global npm install: electron is a dependency, find it
  // Try relative to this script (npm global prefix)
  const globalPrefix = resolve(import.meta.dirname, '..', 'node_modules', 'electron');
  if (existsSync(resolve(globalPrefix, 'cli.js'))) {
    return {
      electron: process.execPath,
      args: [resolve(globalPrefix, 'cli.js')],
      cwd: projectRoot,
    };
  }

  // Fallback: assume electron is on PATH
  return {
    electron: 'electron',
    args: [projectRoot],
    cwd: projectRoot,
  };
}

const { electron, args: baseArgs, cwd } = findElectron();
const electronArgs = [...baseArgs, `--opengit-repo=${target}`];

const child = spawn(electron, electronArgs, {
  cwd,
  stdio: 'inherit',
  detached: true,
});

child.unref();

child.on('error', (err) => {
  console.error(`opengit: failed to start Electron: ${err.message}`);
  console.error('Make sure electron is installed: npm install');
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});

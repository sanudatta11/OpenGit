# OpenGit

<img width="1254" height="1254" alt="OpenGit" src="https://github.com/user-attachments/assets/a2d93071-8c81-4b92-8191-7cec7aec9a65" />




A lightweight desktop Git client for local repository workflows, built with Electron, React, Vite, and TypeScript.

![Dark graph-first workspace](https://img.shields.io/badge/status-alpha-orange)
![Tests](https://img.shields.io/badge/tests-44%20passing-brightgreen)

## Features

- **Graph-first commit history** with colored lanes, branch/tag labels, and virtualized canvas rendering
- **Working tree staging** — stage, unstage, discard files and hunks with confirmation dialogs
- **Monaco diff viewer** — side-by-side and unified diffs with syntax highlighting for 40+ languages
- **Branch operations** — checkout, create, rename, delete, merge (no-ff, squash), rebase
- **Remote operations** — fetch (with prune), pull (--ff-only), push (force-with-lease only)
- **Stash management** — create (with --include-untracked, --keep-index), apply, pop, drop
- **Cherry-pick & revert** with safety confirmation dialogs
- **In-progress recovery** — abort, continue, skip for merge/rebase/cherry-pick mid-operation
- **Worktree management** — create, remove, prune from the sidebar
- **Operation log** — see every git command run by the app with filter and copy-command
- **Settings** — configure git binary path, diff view, context lines, recent repositories
- **Keyboard shortcuts** — Ctrl+Enter to commit, Ctrl+L for log, Ctrl+, for settings

## Screenshot

```
<img width="1776" height="1110" alt="OpenGit Intro" src="https://github.com/user-attachments/assets/84618bc9-385b-4177-906f-8a0032154f0d" />


```

## Quick Start

```bash
# Prerequisites: Node.js >= 20, git, npm
git clone https://github.com/sanudatta11/OpenGit.git
cd OpenGit
npm install
npm run dev
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start in development mode with HMR |
| `npm run build` | Build for production |
| `npm start` | Preview production build |
| `npm test` | Run 44 unit + integration tests |
| `npm run typecheck` | TypeScript type-check |
| `npm run lint` | ESLint |
| `npm run package` | Build distributables (dmg/nsis/AppImage) |

## Architecture

```
opengit/
  electron/
    main/          # Electron main process (window, IPC, git engine)
      git/         # git CLI wrapper (execa) + parsers + operations
      ipc/         # IPC handlers per domain
    preload/       # contextBridge exposure
  src/             # React renderer
    components/    # UI: graph, inspector, sidebar, diff
    graph/         # Lane algorithm + color hashing
    monaco/        # Monaco Editor bootstrap + language mapper
    queries/       # TanStack Query hooks
    stores/        # Zustand state
    ipc/           # Typed window.api wrapper
  shared/          # THE CONTRACT: types + IPC schemas (main ↔ renderer)
  tests/           # Vitest (unit + integration against real git repos)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 33, electron-vite 2 |
| Renderer | React 18, TypeScript 5, Tailwind CSS 3 |
| Git engine | Native `git` CLI via execa (porcelain v2 + `-z`) |
| State | Zustand 5, TanStack Query 5 |
| Diff viewer | Monaco Editor 0.55 + @monaco-editor/react 4.7 |
| IPC validation | Zod 3 |
| Icons | Lucide React |
| Tests | Vitest 2 (44 tests against temp git repos) |

## Safety Model

- Confirmation dialogs for: rebase, cherry-pick, merge, stash pop/drop, branch delete, worktree remove, discard, force push
- Push API only exposes `--force-with-lease`, never raw `--force`
- Detects in-progress git states (merge, rebase, cherry-pick, revert, bisect) with recovery buttons
- All git errors surfaced with raw command output + friendly explanation
- Operation log records every git command for audit

## License

MIT

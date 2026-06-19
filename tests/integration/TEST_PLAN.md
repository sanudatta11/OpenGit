# OpenGit Integration Test Plan (Enhanced)

> Enhanced from v1. Two-layer architecture, backend-function traceability, concrete
> assertions, error-path / concurrency / cancellation / log / performance coverage,
> CI matrix, fixed setup script, fixtures, and helper signatures matching the real API.
>
> Save this file, clear context, then apply the plan to implement.

---

## 0. Test Architecture & Principles

### 0.1 Two layers

OpenGit is an Electron app with a thin IPC boundary over a git engine in
`electron/main/git/`. We test at **two distinct layers** — do not mix them.

| Layer | Tooling | What it exercises | Where | Status |
|-------|---------|-------------------|-------|--------|
| **A — Operation-level** | Vitest (node env) | `electron/main/git/*` functions called **directly**, against a **real git binary** and a **real temp repo** | `tests/integration/*.test.ts` | Build now |
| **B — UI-level (E2E)** | Playwright + Electron | Renderer React components, IPC round-trip, clicks/keyboard/right-clicks | `tests/e2e/*.spec.ts` (future) | Spec only |

Layer A is what the existing tests (`writes.test.ts`, `worktree.test.ts`,
`advanced.test.ts`) already do: import the operation function and call it with a
real worktree path. **This plan makes Layer A complete.** Every UI scenario in
Section 2.F is backed by one or more Layer A tests that prove the underlying
operation works; the UI test then only needs to prove the wiring (click → IPC →
operation → render).

### 0.2 Principles

1. **Real git, real filesystem.** Never mock `git` or `execa`. The point of
   integration tests is to catch porcelain/CLI parsing drift, shell-quoting
   bugs, and platform differences. Mocks belong in unit tests (`tests/unit/`).
2. **One fresh repo per test (or per `describe`).** Use `mkdtempSync` for a
   unique temp dir on every run. **Never share a fixed path like
   `/tmp/opengit-test-repo`** — parallel test files will race and corrupt each
   other. See `advanced.test.ts` for the `beforeEach` re-init pattern.
3. **Parallel-safe by default.** Vitest runs files in parallel. Each file owns
   its own temp root; `cleanupTestRepo` removes it in `afterAll`. Do not write
   into the workspace or `$TMPDIR/opengit-test-repo`.
4. **Table-driven where parametric.** Reset modes, undo action-kinds, merge
   strategies, search kinds → one `describe.each`/`it.each` table, not 4 copies.
5. **Assert on the `WriteResult` envelope, not just `success`.** Check
   `data.conflicts`, `data.fastForward`, `changedRefs`, `requiresRefresh`,
   `state` — these are what the renderer branch invalidation logic reads.
6. **Assert on disk state too.** After a write, read the file / run `git log` /
   `git branch` to confirm the repo actually changed. This catches the
   "operation returned success but did nothing" class of bug.
7. **No `any` in test code.** Use the real types from `@shared/ipc` and
   `electron/main/git/operations`. If a return type is weak, fix the source.
8. **Timeouts.** Default vitest `testTimeout: 15_000` is fine for unit work but
   **bump to 60_000 for any test that runs the full `setup-test-repo.sh`** or
   the `--large` generator. Set per-test via `it('...', async () => {...}, 60_000)`.
9. **No network.** Remotes are local bare repos on disk (`git init --bare`).
   This keeps tests hermetic and offline.

### 0.3 Layer legend

Every scenario row is tagged:
- **A** — testable now at Layer A (operation function + real git).
- **B** — UI-only (needs Playwright/Electron); the Layer A test it depends on is
  named in parentheses, e.g. `B (← A.3.4)`.
- **A+B** — has both an operation-level test and a UI test.

### 0.4 What is NOT tested here

- React component rendering, layout, theme pixels → unit/component tests.
- Monaco editor internals → upstream.
- Electron packaging/installer → manual + CI smoke.
- Git LFS pointer file content correctness → upstream; we only test that
  `lfsTrack`/`lfsUntrack` update `.gitattributes` and `listLFSTracked` reads it.

---

## 1. Sample Repo Setup Script (fixed + extended)

### 1.1 Fixes applied vs. v1 script

| Problem in v1 | Fix |
|----------------|-----|
| No `commit.gpgsign false` → fails if user's global config signs | Set `git config commit.gpgsign false` in **every** init (main, submodule, hotfix wt) |
| Fixed path `/tmp/opengit-test-repo` → parallel race | Accept `$OPENGIT_TEST_ROOT` or create `mktemp -d` per call; helpers pass a unique dir |
| `git lfs track` runs unconditionally → fails if git-lfs missing | Guard with `command -v git-lfs` and a `--no-lfs` flag |
| No binary file for binary-diff edge case | Add `assets/logo.png` with PNG header bytes |
| No renamed file for rename-diff | `git mv old new` on a dedicated commit |
| No unicode/emoji commit | Add a commit with CJK + emoji subject |
| No file-mode change | `chmod +x` + `git update-index --chmod=+x` |
| No detached HEAD state | Add a detached worktree at tag `v1.0.0` |
| No stash-conflict fixture | Add a stash whose re-application conflicts with later edits |
| No large-repo generator | `--large N` flag generates N commits via a loop |
| Submodule init left dirty | Submodule commit is clean and recorded |

### 1.2 `tests/integration/setup-test-repo.sh`

```bash
#!/usr/bin/env bash
# Builds a fully-featured OpenGit test repository.
# Usage: setup-test-repo.sh [TEST_ROOT] [--large N] [--no-lfs] [--with-gpg]
set -euo pipefail

TEST_ROOT="${OPENGIT_TEST_ROOT:-$(mktemp -d -t opengit-test-XXXXXX)}"
REPO="$TEST_ROOT/main"
LARGE=0
DO_LFS=1
DO_GPG=0
for arg in "$@"; do
  case "$arg"" in
    --large) LARGE=2000 ;;          # override with --large=10000 if needed
    --large=*) LARGE="${arg#*=}" ;;
    --no-lfs) DO_LFS=0 ;;
    --with-gpg) DO_GPG=1 ;;
  esac
done

git_init_with_identity() {
  git init -q "$1"
  git -C "$1" config user.name  "Test User"
  git -C "$1" config user.email "test@opengit.dev"
  git -C "$1" config commit.gpgsign false
  git -C "$1" config core.autocrlf false
}

rm -rf "$TEST_ROOT"
mkdir -p "$TEST_ROOT"
git_init_with_identity "$REPO"
cd "$REPO"

# ── Initial commit ──
printf '# OpenGit Test Repo\n' > README.md
printf 'node_modules/\nout/\n' > .gitignore
git add README.md .gitignore
git commit -q -m "Initial commit"

# ── Feature branch with multiple commits (for rebase/cherry-pick tests) ──
git checkout -q -b feature/login
printf 'export function login() {}\n' > src/auth.ts
git add src/auth.ts && git commit -q -m "Add login function"
printf 'export function logout() {}\n' >> src/auth.ts
git add src/auth.ts && git commit -q -m "Add logout function"
printf 'export function validate() {}\n' >> src/auth.ts
git add src/auth.ts && git commit -q -m "Add validate function"

# ── Another feature branch (for worktree + merge tests) ──
git checkout -q main
git checkout -q -b feature/dashboard
mkdir -p src/components
printf 'export const Dashboard = () => null;\n' > src/components/Dashboard.tsx
git add src/components/Dashboard.tsx && git commit -q -m "Add Dashboard component"
printf 'export const Sidebar = () => null;\n' > src/components/Sidebar.tsx
git add src/components/Sidebar.tsx && git commit -q -m "Add Sidebar component"

# ── Merge feature/login into main (no-ff → merge commit for graph lanes) ──
git checkout -q main
git merge --no-ff -m "Merge feature/login" feature/login

# ── Tag a release ──
git tag -a v1.0.0 -m "Release v1.0.0"

# ── More commits on main ──
printf 'export function helper() {}\n' > src/utils.ts
git add src/utils.ts && git commit -q -m "Add utility functions"
printf 'export function apiClient() {}\n' > src/api.ts
git add src/api.ts && git commit -q -m "Add API client"

# ── Rename fixture (for rename-diff tests) ──
printf 'old content\n' > src/old-name.ts
git add src/old-name.ts && git commit -q -m "Add old-name file"
git mv src/old-name.ts src/new-name.ts
git commit -q -m "Rename old-name to new-name"

# ── Binary fixture (for binary-diff tests) ──
mkdir -p assets
# Minimal valid PNG header + IHDR (8x8) so isBinaryContent() triggers.
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x08\x00\x00\x00\x08\x08\x02\x00\x00\x00' > assets/logo.png
git add assets/logo.png && git commit -q -m "Add binary PNG asset"

# ── File-mode change fixture ──
printf '#!/usr/bin/env bash\necho hi\n' > scripts/run.sh
git add scripts/run.sh && git commit -q -m "Add shell script"
chmod +x scripts/run.sh
git update-index --chmod=+x scripts/run.sh
git commit -q -m "Make run.sh executable"

# ── Unicode / emoji commit (for rendering edge case) ──
printf 'export const emoji = "🎉";\n' > src/emoji.ts
git add src/emoji.ts
git commit -q -m "Add 漢字 emoji 🎉 support"

# ── Uncommitted changes: staged + unstaged + untracked (for WIP bar) ──
printf 'TODO: refactor auth\n' >> src/auth.ts          # unstaged (tracked)
printf "export const version = '1.0.0';\n" > src/config.ts
git add src/config.ts                                    # staged
printf 'export function newFeature() {}\n' > src/new-feature.ts  # untracked

# ── Stash #1 (with untracked) ──
printf 'stash-me: work in progress\n' >> src/utils.ts
git stash push -u -m "WIP: utility refactor"

# ── Stash #2 (tracked only) ──
printf 'stash-me: debug info\n' >> README.md
git stash push -m "Debug info added to README"

# ── Stash #3: will conflict if reapplied on top of a later edit (for stash-conflict edge) ──
printf 'SHARED_LINE: original\n' > src/shared.txt
git add src/shared.txt && git commit -q -m "Add shared.txt"
printf 'SHARED_LINE: stashed edit\n' > src/shared.txt
git stash push -m "Shared edit stash"
# Now change shared.txt differently on main → reapplying the stash conflicts.
printf 'SHARED_LINE: main edit\n' > src/shared.txt
git add src/shared.txt && git commit -q -m "Edit shared.txt on main"

# ── Conflict branches (NOT merged here; tests trigger the merge) ──
git checkout -q -b feature/conflict-test
printf 'Version handling v2\n' > src/version.ts
printf 'CONFLICT SIDE A: feature branch version\n' > CONFLICT.md
printf "const CONFIG_FEATURE = 'A';\n" > src/shared-config.ts
git add src/version.ts CONFLICT.md src/shared-config.ts
git commit -q -m "Conflict test: feature side"

git checkout -q main
git checkout -q -b feature/conflict-other
printf 'Version handling v3\n' > src/version.ts
printf 'CONFLICT SIDE B: other branch version\n' > CONFLICT.md
printf "const CONFIG_OTHER = 'B';\n" > src/shared-config.ts
git add src/version.ts CONFLICT.md src/shared-config.ts
git commit -q -m "Conflict test: other side"

# ── Ahead-test branch (for ahead/behind indicators) ──
git checkout -q main
git checkout -q -b feature/ahead-test
printf 'Ahead commit 1\n' > ahead.txt
git add ahead.txt && git commit -q -m "Ahead: commit 1"
printf 'Ahead commit 2\n' >> ahead.txt
git add ahead.txt && git commit -q -m "Ahead: commit 2"

# ── Worktrees ──
git checkout -q main
git worktree add "$TEST_ROOT/wt-feature-dashboard" feature/dashboard
git worktree add "$TEST_ROOT/wt-hotfix" -b hotfix/urgent-fix main
cd "$TEST_ROOT/wt-hotfix"
printf 'Hotfix applied\n' > hotfix.txt
git add hotfix.txt && git commit -q -m "Apply urgent hotfix"
cd "$REPO"
git worktree lock "$TEST_ROOT/wt-feature-dashboard" --reason "Testing lock feature"
# Detached HEAD worktree at the tag (for detached-HEAD edge case)
git worktree add --detach "$TEST_ROOT/wt-detached" v1.0.0

# ── Remote setup (local bare repo as remote) ──
REMOTE="$TEST_ROOT/remote.git"
git init --bare -q "$REMOTE"
git remote add origin "$REMOTE"
git push -qu origin main
git push -q origin feature/login feature/dashboard
git push -q origin feature/conflict-test feature/conflict-other
git push -q origin --tags

# ── Submodule ──
SUBMODULE="$TEST_ROOT/submodule-lib"
git_init_with_identity "$SUBMODULE"
cd "$SUBMODULE"
printf "export const lib = 'v1';\n" > index.ts
git add index.ts && git commit -q -m "Submodule initial"
cd "$REPO"
git submodule add -q "$SUBMODULE" libs/submodule-lib
git commit -q -m "Add submodule"

# ── LFS tracking (optional) ──
if [[ "$DO_LFS" -eq 1 ]] && command -v git-lfs >/dev/null 2>&1; then
  git lfs track -- '*.png' '*.jpg' '*.psd'
  git add .gitattributes
  git commit -q -m "Setup LFS tracking for images"
elif [[ "$DO_LFS" -eq 1 ]]; then
  printf '*.png filter=lfs diff=lfs merge=lfs -text\n' > .gitattributes
  git add .gitattributes
  git commit -q -m "Add .gitattributes (LFS not installed; patterns recorded)"
fi

# ── Large-repo generator (optional) ──
if [[ "$LARGE" -gt 0 ]]; then
  git checkout -q main
  for i in $(seq 1 "$LARGE"); do
    printf 'line %s\n' "$i" >> src/generated.txt
    git add src/generated.txt
    GIT_AUTHOR_DATE="2024-01-01T00:00:$(printf '%02d' $((i % 60)))" \
      GIT_COMMITTER_DATE="2024-01-01T00:00:$(printf '%02d' $((i % 60)))" \
      git commit -q -m "Generated commit $i"
  done
fi

# ── GPG (optional, manual only) ──
if [[ "$DO_GPG" -eq 1 ]] && [[ -f "$TEST_ROOT/gpg-key.txt" ]]; then
  gpg --batch --import "$TEST_ROOT/gpg-key.txt" 2>/dev/null || true
  git config user.signingkey "$(gpg --batch --list-keys --with-colons test@opengit.dev 2>/dev/null | awk -F: '/^pub:/{print $5; exit}')"
  git config commit.gpgsign true
  printf 'signed\n' > signed.txt
  git add signed.txt && git commit -S -m "GPG signed commit"
fi

# ── Summary ──
echo ""
echo "================================================"
echo " Test root:    $TEST_ROOT"
echo " Main repo:    $REPO"
echo " Worktrees:    $TEST_ROOT/wt-feature-dashboard"
echo "               $TEST_ROOT/wt-hotfix"
echo "               $TEST_ROOT/wt-detached (detached @ v1.0.0)"
echo " Remote (bare):$REMOTE"
echo " Submodule:    $SUBMODULE"
echo " Large commits:$LARGE"
echo "================================================"
```

### 1.3 Optional GPG key script — `tests/integration/gpg-key.txt`

Use only when `--with-gpg` is passed. Place a non-interactive batch key:

```
%no-protection
Key-Type: RSA
Key-Length: 2048
Name-Real: Test User
Name-Email: test@opengit.dev
Expire-Date: 0
%commit
```

Generate once with `gpg --batch --gen-key gpg-key.txt` and export to the test
root. CI jobs that lack a gpg agent MUST skip GPG tests via `it.skipIf(!gpgAvailable())`.

---

## 2. Test Scenarios

### Convention

Each row: **ID | Scenario | Backend fn | Steps | Expected / assertion | Layer**.
`Backend fn` is the exact import from `electron/main/git/*` that the Layer A
test calls. UI-only rows cite the Layer A test they depend on.

### 2.A Operation-level suites (Layer A — Vitest)

#### 2.A.1 Repo lifecycle — `tests/integration/lifecycle.test.ts` (NEW)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.1.1 | Open existing repo | `openRepo` | `openRepo(repoDir)` | `result.workTree === repoDir`, `result.gitDir` ends `.git` | A |
| A.1.2 | Open non-repo dir | `openRepo` | `openRepo(mkdtempSync())` | throws `GitError` with `code: 'NotARepo'` | A |
| A.1.3 | Open missing path | `openRepo` | `openRepo('/no/such/path')` | throws `GitError` `code: 'NotARepo'` | A |
| A.1.4 | Create empty repo | `createRepository` | `createRepository({ path: tmp, repoName: 'r', readme: true, gitignore: 'node_modules', license: 'MIT' })` | `result.success`, `result.data.path` exists, has `README.md`/`.gitignore`/`LICENSE` | A |
| A.1.5 | Create bare repo | `createRepository` | `…{ bare: true, defaultBranch: 'main' }` | `result.success`, dir has `HEAD`/`config` but no worktree files | A |
| A.1.6 | Clone from local bare | `cloneRepository` | `cloneRepository({ url: remoteGit, destinationParent: tmp })` | `result.success`, `result.data.path` exists, `git -C <path> log` shows commits | A |
| A.1.7 | Clone with depth | `cloneRepository` | `…{ shallowDepth: 1 }` | cloned repo has exactly 1 reachable commit from HEAD | A |
| A.1.8 | Clone recursive submodules | `cloneRepository` | `…{ recursiveSubmodules: true }` onto a repo with a submodule | submodule dir populated | A |
| A.1.9 | Infer clone name | `inferCloneRepoName` | table: `https://x/foo.git`→`foo`, `git@x:r/bar`→`bar`, `x/baz/`→`baz` | each matches | A |
| A.1.10 | Resolve create target | `resolveCreateTarget` | `{ path: 'a/b', repoName: 'c' }` | joins to `a/b/c` | A |

#### 2.A.2 Reads — `tests/integration/reads.test.ts` (NEW)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.2.1 | Status parses staged/unstaged/untracked | `getStatus` | on test repo (has all 3) | `entries` partition by `staged`/`unstaged`/`untracked` flags | A |
| A.2.2 | Status on clean tree | `getStatus` | after `git reset --hard` | `entries.length === 0` | A |
| A.2.3 | Log paginates | `getLog` | `{ skip:0, limit:5 }` | `commits.length === 5`, `hasMore === true` | A |
| A.2.4 | Log range filter | `getLog` | `{ range: 'main..feature/ahead-test', limit:100 }` | only commits unique to ahead-test | A |
| A.2.5 | Log path filter | `getLog` | `{ paths: ['src/auth.ts'], limit:100 }` | every commit touched auth.ts | A |
| A.2.6 | Log skip beyond end | `getLog` | `{ skip: 999_999, limit: 10 }` | `commits.length === 0`, `hasMore === false` | A |
| A.2.7 | Branches include local/remote/tag | `getBranches` | on test repo | `branches` has `kind` ∈ local/remote/tag; `currentHeadSha` non-null on main | A |
| A.2.8 | Branches track upstream | `getBranches` | main has `origin/main` upstream | branch `upstream === 'refs/remotes/origin/main'`, `ahead`/`behind` numbers present | A |
| A.2.9 | Remotes parse | `getRemotes` | on test repo | `[{ name:'origin', fetchUrl, pushUrl }]` | A |
| A.2.10 | State: clean | `getState` | clean repo | `states.length === 0` | A |
| A.2.11 | State: merge in progress | `getState` | after a conflicting merge | `states` contains `kind:'merge'`, `canAbort:true` | A |
| A.2.12 | State: rebase in progress | `getState` | after a conflicting rebase | `states` contains `kind:'rebase'`, `step`/`total` set | A |
| A.2.13 | Head ref symbolic | `getBranches` | on main | `headRef === 'ref: refs/heads/main'` derived | A |
| A.2.14 | Head detached | `getBranches` | checkout tag → query | `headSha` set, `headRef === null` | A |

#### 2.A.3 Working tree / staging / hunks — `tests/integration/working-tree.test.ts` (EXPAND existing `writes.test.ts`)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.3.1 | Stage one file | `stagePaths` | `stagePaths(repo, ['a.txt'])` | `success`; status entry `staged===true` | A |
| A.3.2 | Stage all | `stageAll` | after modifying 3 files | `success`; all 3 `staged===true` | A |
| A.3.3 | Unstage one | `unstagePaths` | `unstagePaths(repo, ['a.txt'])` | `success`; entry `staged===false, unstaged===true` | A |
| A.3.4 | Unstage all | `unstageAll` | after staging 3 | `success`; all `staged===false` | A |
| A.3.5 | Discard tracked change | `discardPaths` | on modified `a.txt` | file reverts to HEAD content | A |
| A.3.6 | Discard untracked | `discardUntracked` | on `temp.txt` | file removed from disk | A |
| A.3.7 | Stage hunk (by-header) | `stageHunks` | mode `by-header`, one hunk of `a.txt` | only that hunk staged; rest unstaged | A |
| A.3.8 | Stage hunk (apply-patch) | `stageHunks` | mode `apply-patch`, patch string | hunk applied to index | A |
| A.3.9 | Unstage hunk | `unstageHunks` | symmetric to A.3.7 | hunk returns to unstaged | A |
| A.3.10 | Stage nonexistent path | `stagePaths` | `['nope.txt']` | `success===false` and stderr non-empty (graceful, no throw) | A |
| A.3.11 | Stage empty list | `stagePaths` | `[]` | `success===false` (Zod blocks at IPC; at fn level, returns failure) | A |

#### 2.A.4 Commit — `tests/integration/commit.test.ts` (EXPAND)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.4.1 | Basic commit | `createCommit` | `{ message:'m' }` after staging | `success`, `data.sha` matches `/^[0-9a-f]{40}$/`, `changedRefs==['HEAD']`, `requiresRefresh===true` | A |
| A.4.2 | Amend | `createCommit` | `{ message:'m2', amend:true }` | HEAD subject replaced; sha unchanged OR rewritten; reflog shows amend | A |
| A.4.3 | Signoff | `createCommit` | `{ message:'m', signoff:true }` | commit body contains `Signed-off-by: Test User <test@opengit.dev>` | A |
| A.4.4 | noVerify skips hook | `createCommit` | install a failing pre-commit hook; `{ message:'m', noVerify:true }` | `success===true` (hook not run) | A |
| A.4.5 | Hook blocks when not skipped | `createCommit` | same hook; `{ message:'m' }` (no noVerify) | `success===false`, stderr contains hook output | A |
| A.4.6 | Author override | `createCommit` | `{ message:'m', author:{name:'X',email:'x@x'} }` | `git log --format='%an %ae'` shows `X x@x` | A |
| A.4.7 | Empty commit on nothing staged | `createCommit` | clean tree | `success===false` (git refuses) | A |
| A.4.8 | GPG sign (optional) | `createCommit` | with `--with-gpg` fixture + `commit.gpgsign=true`; skip via `it.skipIf(!gpgAvailable())` | `verifyCommit(sha).verified === true` | A |

#### 2.A.5 Branches — `tests/integration/branches.test.ts` (NEW)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.5.1 | Checkout existing | `checkoutBranch` | `checkoutBranch(repo,'dev')` | `success`; `git rev-parse --abbrev-ref HEAD` === `dev` | A |
| A.5.2 | Checkout + create | `checkoutBranch` | `checkoutBranch(repo,'new',true)` | new branch exists and is HEAD | A |
| A.5.3 | Checkout force over local mods | `checkoutBranch` | dirty tree; `force:true` | `success===true` (changes discarded by git) | A |
| A.5.4 | Checkout bad ref | `checkoutBranch` | `checkoutBranch(repo,'nope')` | `success===false`, stderr mentions pathspec | A |
| A.5.5 | Create (no checkout) | `createBranch` | `createBranch(repo,'f','HEAD',false)` | branch listed; HEAD unchanged | A |
| A.5.6 | Create + checkout | `createBranch` | `createBranch(repo,'f','HEAD',true)` | branch listed; HEAD === `f` | A |
| A.5.7 | Delete non-current | `deleteBranch` | `deleteBranch(repo,'f',false)` | branch gone | A |
| A.5.8 | Delete current fails | `deleteBranch` | `deleteBranch(repo,<current>,false)` | `success===false` | A |
| A.5.9 | Force delete (unmerged) | `deleteBranch` | unmerged branch; `force:true` | `success===true` | A |
| A.5.10 | Rename | `renameBranch` | `renameBranch(repo,'old','new')` | `old` gone, `new` exists, same sha | A |
| A.5.11 | Set upstream | `setUpstream` | `setUpstream(repo,'dev','origin/dev')` | `git config branch.dev.merge` === `refs/heads/dev` | A |

#### 2.A.6 Remotes — `tests/integration/remotes.test.ts` (NEW)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.6.1 | Fetch origin | `fetchRemote` | `fetchRemote(repo,'origin',true)` | `success`, `data.fetched >= 0`, `changedRefs==['refs/remotes']` | A |
| A.6.2 | Fetch with prune removes gone ref | `fetchRemote` | delete a remote branch on bare, fetch `prune:true` | `data.pruned` contains the ref | A |
| A.6.3 | Fetch unknown remote | `fetchRemote` | `fetchRemote(repo,'nope',true)` | `success===false` | A |
| A.6.4 | Fetch all | `fetchAllRemotes` | with 2 remotes | `success`, `data.fetched` summed | A |
| A.6.5 | Pull ff | `pullRemote` | repo behind origin/main, `strategy:'ff-only'` | `success`, HEAD advances, no merge commit | A |
| A.6.6 | Pull merge | `pullRemote` | diverged; `strategy:'merge'` | `success`, merge commit created | A |
| A.6.7 | Pull rebase | `pullRemote` | diverged; `strategy:'rebase'` | `success`, linear history, no merge commit | A |
| A.6.8 | Pull ff-only on diverged fails | `pullRemote` | diverged; `strategy:'ff-only'` | `success===false` | A |
| A.6.9 | Push new branch | `pushRemote` | `pushRemote(repo,'origin','dev',false,false)` | `success`, remote ref exists | A |
| A.6.10 | Push sets upstream | `pushRemote` | `pushRemote(repo,'origin','dev',false,true)` | `git config branch.dev.remote` === `origin` | A |
| A.6.11 | Push rejected (non-ff) | `pushRemote` | remote ahead; normal push | `success===false`, `data.rejected===true` | A |
| A.6.12 | Force-with-lease succeeds | `pushRemote` | rejected case; `forceWithLease:true` | `success===true` | A |
| A.6.13 | Force-with-lease fails if remote moved | `pushRemote` | push, remote gets new commit, force-with-lease again | `success===false` (lease broken) | A |

#### 2.A.7 Push rejection recovery — `tests/integration/push-rejection.test.ts` (NEW)

Maps UI 2.7. These call `pullRemote` with the strategy chosen by the banner button.

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.7.1 | Recover via rebase | `pullRemote` then `pushRemote` | rejected → `pullRemote(…,'rebase')` → `pushRemote` | both `success`; linear history | A |
| A.7.2 | Recover via merge | `pullRemote` then `pushRemote` | rejected → `pullRemote(…,'merge')` → `pushRemote` | both `success`; merge commit present | A |
| A.7.3 | Recover via force | `pushRemote` | rejected → `pushRemote(…,forceWithLease:true)` | `success===true` | A |

#### 2.A.8 Stash — `tests/integration/stash.test.ts` (EXPAND `advanced.test.ts`)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.8.1 | Create + list | `createStash`/`listStashes` | dirty tree, `{message:'s'}` | list length 1, subject contains `s` | A |
| A.8.2 | No changes → no stash | `createStash` | clean tree | `success===true`, list length 0 | A |
| A.8.3 | Include untracked | `createStash` | `{includeUntracked:true}` | untracked file gone; reapply restores it | A |
| A.8.4 | keepIndex | `createStash` | stage, then `{keepIndex:true}` | index preserved after stash | A |
| A.8.5 | Apply | `applyStash` | `applyStash(repo,'stash@{0}',false)` | worktree content restored | A |
| A.8.6 | Pop | `popStash` | `popStash(repo,'stash@{0}')` | applied AND dropped (list length decreases) | A |
| A.8.7 | Drop | `dropStash` | `dropStash(repo,'stash@{0}')` | list length decreases | A |
| A.8.8 | Stash diff | `stashDiff` | `stashDiff(repo,'stash@{0}')` | returns unified diff string containing the stashed content | A |
| A.8.9 | Apply on dirty tree conflicts | `applyStash` | edit file to a different value, apply stash that touched same lines | `success===false` (conflict) | A |
| A.8.10 | Apply nonexistent ref | `applyStash` | `applyStash(repo,'stash@{99}')` | `success===false` | A |

#### 2.A.9 Worktrees — `tests/integration/worktree.test.ts` (EXPAND existing)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.9.1 | List default | `listWorktrees` | fresh repo | 1 worktree, `isMain===true`, `branch==='refs/heads/main'` | A |
| A.9.2 | Create detached | `createWorktree` | `{path, start:'HEAD'}` | 2 worktrees, new one `detached===true` | A |
| A.9.3 | Create with branch | `createWorktree` | `{path, branch:'f', start:'HEAD'}` | `branch==='refs/heads/f'`, `detached===false` | A |
| A.9.4 | Create with lock reason | `createWorktree` | `{path, start:'HEAD', lock:'r'}` | `git worktree list --porcelain` shows `locked` | A |
| A.9.5 | Lock existing | `lockWorktree` | `lockWorktree(repo,wtPath,'reason')` | `success`; porcelain shows `locked reason` | A |
| A.9.6 | Unlock | `unlockWorktree` | `unlockWorktree(repo,wtPath)` | `success`; porcelain no `locked` | A |
| A.9.7 | Remove | `removeWorktree` | `removeWorktree(repo,wtPath,false)` then `force:true` fallback | list length decreases | A |
| A.9.8 | Remove + delete branch | `removeWorktreeAndBranch` | `removeWorktreeAndBranch(repo,wtPath,'f',true)` | worktree gone AND `git branch --list f` empty | A |
| A.9.9 | Prune stale | `pruneWorktrees` | create wt, `rm -rf` its dir, prune | stale entry gone | A |
| A.9.10 | Remove nonexistent | `removeWorktree` | `removeWorktree(repo,'/no/such',false)` | `success===false` | A |
| A.9.11 | List with locked + detached present | `listWorktrees` | on test repo (3 wts incl locked + detached) | parser yields 3 entries with correct `locked`/`detached` flags | A |

#### 2.A.10 Tags — `tests/integration/tags.test.ts` (NEW — **GAP**)

> **Gap:** There is no `tag:create` / `tag:delete` IPC channel or backend
> function. Tags are only **read** via `getBranches` (which enumerates
> `refs/tags/`). The UI scenarios 10.2/10.3 cannot be backed by Layer A until a
> `createTag`/`deleteTag` function is added. See Section 10.

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.10.1 | List tags via branches | `getBranches` | on test repo (has `v1.0.0`) | `branches.some(b => b.kind==='tag' && b.shortName==='v1.0.0')` | A |
| A.10.2 | Annotated tag has sha | `getBranches` | same | tag branch `sha` matches `git rev-parse v1.0.0^{}` | A |

#### 2.A.11 Submodules — `tests/integration/submodules.test.ts` (NEW)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.11.1 | List submodule | `listSubmodules` | on test repo | contains `{path:'libs/submodule-lib', sha:<40hex>}` | A |
| A.11.2 | Init (non-recursive) | `initSubmodules` | `initSubmodules(repo,false)` | `success`; submodule dir has `.git` + `index.ts` | A |
| A.11.3 | Deinit | `deinitSubmodule` | `deinitSubmodule(repo,'libs/submodule-lib',false)` | `success`; submodule working dir cleared | A |
| A.11.4 | List when none | `listSubmodules` | on repo without submodules | `[]` | A |

#### 2.A.12 LFS — `tests/integration/lfs.test.ts` (NEW; `it.skipIf(!lfsAvailable())`)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.12.1 | List tracked | `listLFSTracked` | on test repo | contains `*.png`, `*.jpg`, `*.psd` | A |
| A.12.2 | Track new pattern | `lfsTrack` | `lfsTrack(repo,'*.zip')` | `.gitattributes` gains `*.zip` line; list contains it | A |
| A.12.3 | Untrack | `lfsUntrack` | `lfsUntrack(repo,'*.zip')` | `.gitattributes` no longer has `*.zip` | A |
| A.12.4 | List when LFS absent | `listLFSTracked` | on repo with no `.gitattributes` | `[]` | A |

#### 2.A.13 Merge — `tests/integration/merge.test.ts` (EXPAND `advanced.test.ts`)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.13.1 | Fast-forward | `mergeBranch` | `{ref:'feature'}` ff-able | `success`, `data.fastForward===true`, `data.conflicts===[]` | A |
| A.13.2 | No-ff merge commit | `mergeBranch` | `{ref:'feature', noFf:true}` | `data.fastForward===false`; `git log -1` subject contains `Merge` | A |
| A.13.3 | Squash | `mergeBranch` | `{ref:'feature', squash:true}` | single squashed commit; branch tip not moved | A |
| A.13.4 | noCommit leaves staged | `mergeBranch` | `{ref:'feature', noCommit:true}` | `success`; changes staged but no commit created | A |
| A.13.5 | Conflict detected | `mergeBranch` | merge conflicting branch | `success===false`, `data.conflicts` contains the conflicting path, `state` has `kind:'merge'` | A |
| A.13.6 | Merge nonexistent ref | `mergeBranch` | `{ref:'nope'}` | `success===false` | A |

#### 2.A.14 Conflict resolution — `tests/integration/conflict.test.ts` (NEW)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.14.1 | Conflict versions OURS | `getConflictVersions` | during a merge conflict, on a conflicted file | returns object with `ours` content = current branch version | A |
| A.14.2 | Conflict versions THEIRS | `getConflictVersions` | same | `theirs` content = incoming branch version | A |
| A.14.3 | Conflict versions BASE | `getConflictVersions` | same | `base` content = common ancestor version | A |
| A.14.4 | Resolve by staging ours | `stagePaths` | write ours content to file, `stagePaths` | file no longer in `git diff --name-only --diff-filter=U` | A |
| A.14.5 | Continue merge | `continueOperation` | after all conflicts staged | `success`, no `kind:'merge'` in state | A |

#### 2.A.15 Rebase — `tests/integration/rebase.test.ts` (EXPAND)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.15.1 | Basic rebase succeeds | `rebaseBranch` | feature ahead of main; `rebaseBranch(repo,{onto:'main'})` | `success`, `data.conflicts===[]` | A |
| A.15.2 | Rebase conflict | `rebaseBranch` | conflicting branches | `success===false`, `data.conflicts` non-empty, `data.step`/`total` set | A |
| A.15.3 | Abort | `abortOperation` | during conflict; `abortOperation(repo,'rebase')` | `success`; no rebase state | A |
| A.15.4 | Skip | `skipOperation` | during conflict; `skipOperation(repo,'rebase')` | advances to next step (or completes) | A |
| A.15.5 | Continue after resolve | `continueOperation` | resolve conflicts, stage, `continueOperation(repo,'rebase')` | `success` or advances | A |
| A.15.6 | Interactive plan | `rebaseInteractivePlan` | `rebaseInteractivePlan(repo,'HEAD~3')` | returns ordered list of commits with default `pick` action | A |
| A.15.7 | Apply interactive (reorder) | `applyRebaseInteractive` | swap two rows in the plan, apply | `git log` order reflects the swap | A |
| A.15.8 | Apply interactive (squash) | `applyRebaseInteractive` | change action to `squash` on a row | resulting history has fewer commits, squashed message | A |
| A.15.9 | Apply interactive (drop) | `applyRebaseInteractive` | change action to `drop` | commit absent from history | A |
| A.15.10 | Apply interactive (reword) | `applyRebaseInteractive` | change action to `reword` + new message | commit present with new subject | A |

#### 2.A.16 Cherry-pick & revert — `tests/integration/cherry-pick.test.ts` (EXPAND)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.16.1 | Cherry-pick | `cherryPick` | `cherryPick(repo,[sha],false)` | `success`; file appears; `git log -1` subject matches source | A |
| A.16.2 | Cherry-pick no-commit | `cherryPick` | `cherryPick(repo,[sha],true)` | changes staged, no new commit | A |
| A.16.3 | Cherry-pick conflict | `cherryPick` | onto a branch that touched same lines | `success===false`, state `kind:'cherry-pick'` | A |
| A.16.4 | Cherry-pick multiple | `cherryPick` | `cherryPick(repo,[sha1,sha2],false)` | both commits applied in order | A |
| A.16.5 | Revert | `revertCommits` | `revertCommits(repo,[sha],false)` | `success`; file removed; subject contains `revert` (case-insensitive) | A |
| A.16.6 | Revert no-commit | `revertCommits` | `revertCommits(repo,[sha],true)` | reverse changes staged, no commit | A |
| A.16.7 | Revert conflict | `revertCommits` | revert a commit whose lines since changed | `success===false`, state `kind:'revert'` | A |

#### 2.A.17 Reset — `tests/integration/reset.test.ts` (NEW, table-driven)

| # | Mode | Backend fn | Call | Assertion |
|---|------|-----------|------|-----------|
| A.17.1 | soft | `resetBranch` | `resetBranch(repo,'HEAD~1','soft')` | HEAD moves back; changes remain **staged** |
| A.17.2 | mixed | `resetBranch` | `resetBranch(repo,'HEAD~1','mixed')` | HEAD moves back; changes remain **unstaged** |
| A.17.3 | hard | `resetBranch` | `resetBranch(repo,'HEAD~1','hard')` | HEAD moves back; working tree **clean** |
| A.17.4 | keep | `resetBranch` | `resetBranch(repo,'HEAD~1','keep')` | HEAD moves back; uncommitted tracked changes preserved |
| A.17.5 | bad ref | `resetBranch` | `resetBranch(repo,'nope','soft')` | `success===false` |

All rows are one `it.each([['soft',...],['mixed',...],...])` table.

#### 2.A.18 Undo — `tests/integration/undo.test.ts` (NEW, per-kind matrix)

`undoAction(workTree, { kind, branch?, sha? })` supports 9 action kinds. Each
row asserts the repo returns to the pre-action state.

| # | Action kind | Setup | Call | Assertion |
|---|-------------|-------|------|-----------|
| A.18.1 | `commit` | make a commit | `undoAction(repo,{kind:'commit'})` | HEAD === previous HEAD (sha match); changes back in staged |
| A.18.2 | `merge` | merge --no-ff | `undoAction(repo,{kind:'merge'})` | merge commit gone; HEAD at pre-merge tip |
| A.18.3 | `rebase` | rebase that moved HEAD | `undoAction(repo,{kind:'rebase'})` | HEAD === ORIG_HEAD |
| A.18.4 | `cherry-pick` | cherry-pick a commit | `undoAction(repo,{kind:'cherry-pick'})` | picked commit absent |
| A.18.5 | `revert` | revert a commit | `undoAction(repo,{kind:'revert'})` | revert commit absent; original commit restored |
| A.18.6 | `branch-create` | create branch `f` | `undoAction(repo,{kind:'branch-create', branch:'f'})` | `git branch --list f` empty |
| A.18.7 | `branch-delete` | delete branch `f` (was at sha S) | `undoAction(repo,{kind:'branch-delete', branch:'f'})` | `git branch --list f` exists again at S |
| A.18.8 | `stash-apply` | apply a stash | `undoAction(repo,{kind:'stash-apply'})` | worktree back to pre-apply |
| A.18.9 | `stash-pop` | pop a stash | `undoAction(repo,{kind:'stash-pop'})` | worktree back to pre-pop AND stash entry restored (best-effort) |
| A.18.10 | unknown kind | — | `undoAction(repo,{kind:'???'})` | falls through to `reset --hard ORIG_HEAD` (documented behavior) |

#### 2.A.19 Blame — `tests/integration/blame.test.ts` (NEW)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.19.1 | Blame returns per-line | `getBlame` | `getBlame(repo,'src/auth.ts')` | `BlameEntry[]`, lines cover the file, each has `author`/`sha`/`line` | A |
| A.19.2 | Blame at ref | `getBlame` | `getBlame(repo,'src/auth.ts','HEAD~2')` | entries reference older commits only | A |
| A.19.3 | Blame nonexistent file | `getBlame` | `getBlame(repo,'nope.ts')` | throws or returns `[]` (document current behavior) | A |

#### 2.A.20 Branch comparison — `tests/integration/compare.test.ts` (NEW)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.20.1 | Ahead/behind counts | `compareBranches` | `compareBranches(repo,'main','feature/ahead-test')` | `ahead`/`behind` numbers match `git rev-list --count` | A |
| A.20.2 | File changes listed | `compareBranches` | same | `files` matches `git diff --name-only a b` | A |
| A.20.3 | Identical branches | `compareBranches` | `compareBranches(repo,'main','main')` | `ahead===0`, `behind===0`, `files===[]` | A |
| A.20.4 | Remote vs local | `compareBranches` | `compareBranches(repo,'origin/feature/login','main')` | works with remote ref | A |

#### 2.A.21 Previews — `tests/integration/previews.test.ts` (NEW)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.21.1 | Merge preview commits | `mergePreview` | `mergePreview(repo,'feature/login')` | lists commits to be merged | A |
| A.21.2 | Merge preview files | `mergePreview` | same | lists files that will change | A |
| A.21.3 | Pull preview | `pullPreview` | `pullPreview(repo,'origin','main')` | reports ahead/behind vs remote | A |
| A.21.4 | Push preview | `pushPreview` | `pushPreview(repo,'origin','dev')` | lists local commits not on remote | A |
| A.21.5 | Rebase plan | `rebasePlan` | `rebasePlan(repo,'main')` | ordered commit list to be replayed | A |
| A.21.6 | previewCommits range | `previewCommits` | `previewCommits(repo,'main..feature/ahead-test')` | commits unique to ahead-test | A |
| A.21.7 | previewFiles range | `previewFiles` | `previewFiles(repo,'main..feature/ahead-test')` | files changed in range | A |

#### 2.A.22 Repository search — `tests/integration/search.test.ts` (NEW)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.22.1 | Search branches | `searchRepository` | `searchRepository(repo,gitDir,'feature',50)` | results include `feature/*` branches, `kind:'branch'` | A |
| A.22.2 | Search commits by subject | `searchRepository` | `'login'` | results include `kind:'commit'` matching subject | A |
| A.22.3 | Search commits by sha | `searchRepository` | 7-char sha prefix | result `kind:'commit'` with that sha | A |
| A.22.4 | Search files | `searchRepository` | `'src/'` | results `kind:'file'` under `src/` | A |
| A.22.5 | Empty query returns all (up to limit) | `searchRepository` | `''` | results length === limit (branches first) | A |
| A.22.6 | Limit respected | `searchRepository` | `'',5` | results length <= 5 | A |
| A.22.7 | No matches | `searchRepository` | `'zzzzz'` | `[]` | A |

#### 2.A.23 Diff — `tests/integration/diff.test.ts` (EXPAND `tests/unit/diff.test.ts` to integration)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.23.1 | Working-tree vs index | `getDiff` | `getDiff(repo,{path:'a.txt'})` | `DiffResult` with hunks | A |
| A.23.2 | Commit vs parent | `getDiff` | `getDiff(repo,{path:'src/auth.ts', ref:'HEAD'})` | hunks from last commit touching file | A |
| A.23.3 | Two commits | `getDiff` | `getDiff(repo,{path, base:'A', ref:'B'})` | range diff | A |
| A.23.4 | Renamed file | `getDiff` | on `src/new-name.ts` (renamed from `old-name.ts`) | `isRename===true`, `oldPath==='src/old-name.ts'` | A |
| A.23.5 | Binary file | `getDiff` | on `assets/logo.png` | `isBinary===true`, no hunk content | A |
| A.23.6 | No changes | `getDiff` | identical file vs itself | empty hunks / `noChanges` flag | A |
| A.23.7 | ignoreWhitespace | `getDiff` | `{ignoreWhitespace:true}` | whitespace-only diff yields no hunks | A |
| A.23.8 | contextLines | `getDiff` | `{contextLines:0}` | hunks have 0 context lines | A |
| A.23.9 | Commit files list | `getCommitFiles` | `getCommitFiles(repo,sha)` | matches `git show --name-only` | A |
| A.23.10 | File content at ref | `getFileContent` | `getFileContent(repo,'src/auth.ts','HEAD~2')` | content as of that ref | A |

#### 2.A.24 GPG verify — `tests/integration/verify.test.ts` (NEW, `it.skipIf(!gpgAvailable())`)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.24.1 | Verified commit | `verifyCommit` | on a `-S` signed commit (GPG fixture) | `{verified:true, signer:'Test User'}` | A |
| A.24.2 | Unsigned commit | `verifyCommit` | on a normal commit | `{verified:false, signer:''}` | A |
| A.24.3 | Verify nonexistent sha | `verifyCommit` | `verifyCommit(repo,'0000000')` | `{verified:false, signer:''}` (no throw) | A |

#### 2.A.25 In-progress state detection — already in `advanced.test.ts` (EXPAND)

| # | Scenario | Backend fn | Call | Assertion | Layer |
|---|----------|-----------|------|-----------|-------|
| A.25.1 | Merge state | `parseInProgressState` | during merge conflict | `kind:'merge'`, `canAbort:true` | A |
| A.25.2 | Rebase state | `parseInProgressState` | during rebase conflict | `kind:'rebase'`, `step`/`total` set | A |
| A.25.3 | Cherry-pick state | `parseInProgressState` | during cherry-pick conflict | `kind:'cherry-pick'` | A |
| A.25.4 | Revert state | `parseInProgressState` | during revert conflict | `kind:'revert'` | A |
| A.25.5 | Clean state | `parseInProgressState` | clean repo | `[]` | A |
| A.25.6 | getStatus aggregates states | `getStatus` | during merge | `status.states` includes merge | A |

### 2.B Error-path tests — `tests/integration/errors.test.ts` (NEW)

Exercises every `GitErrorCode` from the IPC contract.

| # | Code | How to provoke | Assertion |
|---|------|----------------|-----------|
| B.1 | `GitNotFound` | set `GIT_BIN` to `/no/such/git` via `discoverGitBin('/no/such/git')` then call `getStatus` | throws/returns with `code:'GitNotFound'` |
| B.2 | `NotARepo` | `openRepo(mkdtempSync())` | `code:'NotARepo'` |
| B.3 | `BadInput` | call an IPC handler with a payload that fails Zod (e.g. `branch.create` with name `'a b'`) | `code:'BadInput'` |
| B.4 | `Conflicts` | `mergeBranch` into conflicting state | `success===false`, `data.conflicts` non-empty |
| B.5 | `UncommittedChanges` | attempt an op that requires a clean tree on a dirty tree (if any op enforces) | `code:'UncommittedChanges'` |
| B.6 | `Rejected` | `pushRemote` against an ahead remote without force | `success===false`, `data.rejected===true` |
| B.7 | `GitFailed` | run a git command that exits non-zero for a reason not covered above (e.g. `branch -D` on current) | `success===false` |
| B.8 | `Cancelled` | start a long `fetchRemote`, abort via `AbortController`/`cancelAll()` | `code:'Cancelled'` or `success===false` with cancel marker |
| B.9 | `NotSupported` | call interactive rebase on a stub git <2.6 (skip if real git is newer) | `code:'NotSupported'` |

### 2.C Concurrency & cancellation — `tests/integration/concurrency.test.ts` (NEW)

| # | Scenario | Call | Assertion |
|---|----------|------|-----------|
| C.1 | Two concurrent fetches on same remote | `Promise.all([fetchRemote, fetchRemote])` | both settle; no corruption; at least one `success` |
| C.2 | Fetch then cancel | start fetch, `cancelAll()` mid-flight | settles as cancelled/failed, no hanging child |
| C.3 | Cancel all on teardown | spawn 3 `git sleep`-equivalents, `cancelAll()` | all children killed (no zombie `git` processes for the test PID) |
| C.4 | Concurrent writes to different refs | `Promise.all([createBranch('a'), createBranch('b')])` | both branches exist |
| C.5 | Concurrent stage + commit on different files | stage `a.txt`, commit; stage `b.txt`, commit (serialized) | two distinct commits in order |

> C.3 verification: after the test, `pgrep -P $$ git` should be empty.

### 2.D Operation log — `tests/integration/log.test.ts` (NEW)

The log is pushed via `IPC.LOG_EVENT` after every `gitRun`. At Layer A we can
hook the same emitter the IPC layer uses.

| # | Scenario | Call | Assertion |
|---|----------|------|-----------|
| D.1 | Every gitRun emits a LogEntry | subscribe to the log emitter, run `getStatus` | received entry with `ok:true`, `channel:'repo:status'`, `durationMs>=0` |
| D.2 | Failed run still emits | run a failing command | entry with `ok:false`, `exitCode!==0` |
| D.3 | Argv recorded | run `createCommit` | entry `argv` contains `['commit','-m',...]` |
| D.4 | stdout/stderr captured | run a command with stderr output | entry fields non-empty |

> If there is no public emitter hook, this test is the trigger to add one
> (export a `subscribeLog(cb)` from `electron/main/git/client.ts`). See Section 10.

### 2.E Performance thresholds — `tests/integration/perf.test.ts` (NEW)

Run with `--large 2000` (or 10000 in nightly). Use `it.only` profiling via
`performance.now()`. Thresholds are upper bounds, not goals.

| # | Scenario | Setup | Threshold |
|---|----------|-------|-----------|
| E.1 | `getLog` first 100 commits | 2000-commit repo | < 150 ms |
| E.2 | `getLog` deep skip (skip 1500, limit 100) | same | < 200 ms |
| E.3 | `getBranches` | 50-branch repo | < 80 ms |
| E.4 | `getStatus` on 500-changed tree | 500 modified files | < 250 ms |
| E.5 | `searchRepository` empty query | 2000-commit repo | < 300 ms |
| E.6 | `createCommit` | 1 file staged | < 120 ms |
| E.7 | `getDiff` on a 5k-line file | big text file | < 100 ms |

Mark perf tests with `it.skipIf(!process.env.OPENGIT_PERF)` so the normal
suite stays fast.

### 2.F UI-level scenarios (Layer B — Playwright/Electron, future)

The original UI tables (v1 sections 2.1–2.30) remain the Layer B spec. Each UI
flow is now backed by the Layer A test that proves the underlying operation.
When implementing Layer B, do not re-assert operation correctness — assert only
the wiring: click → IPC call → renderer re-render.

| UI section | Backing Layer A suite |
|-----------|-----------------------|
| 2.1 Repo Lifecycle | A.1 |
| 2.2 Commit Graph | A.2 (log/branches), parser unit tests |
| 2.3 Working Tree | A.3 |
| 2.4 Commit Panel | A.4 |
| 2.5 Branches | A.5 |
| 2.6 Remotes | A.6 |
| 2.7 Push Rejection | A.7 |
| 2.8 Stash | A.8 |
| 2.9 Worktrees | A.9 |
| 2.10 Tags | A.10 (read only — see gap) |
| 2.11 Submodules | A.11 |
| 2.12 LFS | A.12 |
| 2.13 Merging | A.13, A.21 |
| 2.14 Conflict Resolution | A.14 |
| 2.15 Rebase | A.15, A.21 |
| 2.16 Cherry-pick & Revert | A.16 |
| 2.17 Reset | A.17 |
| 2.18 Undo | A.18 |
| 2.19 Blame | A.19 |
| 2.20 In-Progress Ops | A.15, A.25 |
| 2.21 Command Palette | A.22 (search) + UI wiring |
| 2.22 Repository Search | A.22 |
| 2.23 Branch Comparison | A.20 |
| 2.24 Diff Viewer | A.23 |
| 2.25–2.30 Theme/Toast/Terminal/Settings/Resize/Log | UI-only; A.4 backs commit options, A.6 backs toasts |

---

## 3. Edge Cases (expanded with setup instructions)

| Area | Setup | Assertion |
|------|-------|-----------|
| Empty repo | `createRepository({path:tmp,repoName:'e'})` | `getLog` returns `[]`, `hasMore===false`; UI shows "No commits yet" |
| Detached HEAD | `git checkout v1.0.0` (or `wt-detached`) | `getBranches`: `headRef===null`, `headSha` set |
| Large repo | `--large 2000` (nightly 10000) | perf thresholds Section 2.E |
| Binary diffs | `assets/logo.png` in setup | `getDiff`: `isBinary===true` |
| No git in PATH | `discoverGitBin('/no/such')` | `GitError code:'GitNotFound'` |
| Deep submodules | add a submodule that itself has a submodule; `initSubmodules(repo,true)` | nested submodule populated |
| Unicode | setup commit `Add 漢字 emoji 🎉 support` | `getLog` subject preserves bytes; UI renders |
| No upstream | `pushRemote(…,setUpstream:true)` | `git config branch.X.remote` set |
| Stash conflict | `shared.txt` stash (setup §1.2) | `applyStash` → `success===false` |
| Renamed files | `src/new-name.ts` (setup) | `getDiff` `isRename===true` |
| File-permissions | `scripts/run.sh` chmod (setup) | `getDiff` shows mode change `100644 → 100755` |
| Concurrent ops | Section 2.C | no corruption |
| Empty stash | `createStash` on clean tree | `success===true`, list length 0, friendly "no changes" |
| Worktree with spaces | path `wt with spaces` | all worktree ops succeed |
| GPG unsigned | normal commit | `verifyCommit().verified===false` |
| Zoom extremes | UI-only (B) | clamped 50%–200% |
| Multiple solo / Solo+mute | UI-only (B) | graph filter combines |
| Rebase abort | A.15.3 | clean state |
| Cherry-pick conflict | A.16.3 | conflict flow |
| Path with unicode | repo at `$TMPDIR/テスト-🎉/` | `openRepo` works |

---

## 4. Error-path matrix (per `GitErrorCode`)

See Section 2.B. Every code must have at least one provoking test. Codes with
no provocation path today (`NotSupported`) are flagged in Section 10.

---

## 5. Undo action-kind matrix

See Section 2.A.18 — one test per `case` branch in `undoAction`'s switch
(`operations.ts` ~L1034). If a new `case` is added to the source, a new row
must be added here (enforced by a compile-time exhaustiveness check in the test
file: `assertNever(action.kind)` over a typed union).

---

## 6. Reset mode matrix

See Section 2.A.17 — table-driven over `['soft','mixed','hard','keep']`. If a
5th mode is added to `BranchResetInput`, the table must be updated.

---

## 7. CI matrix

| OS | Git | LFS | GPG | Notes |
|----|-----|-----|-----|-------|
| Ubuntu 22.04 | system (2.34+) | apt `git-lfs` | skip | default CI lane |
| macOS 14 | Xcode git / brew | brew `git-lfs` | skip | path-with-spaces + unicode worktree |
| Windows 2022 | git-for-windows | `git-lfs` | skip | backslash paths; `mkdtempSync` returns `C:\...\Temp\...`; verify all helpers use `node:path` join, not string concat |
| Nightly | Ubuntu | with | with | runs `--large 10000`, perf tests, GPG tests |

Env flags:
- `OPENGIT_TEST_ROOT` — override temp root (useful on Windows to keep paths short).
- `OPENGIT_PERF=1` — enable perf thresholds.
- `OPENGIT_GPG=1` — enable GPG tests.
- `OPENGIT_LFS=1` — enable LFS tests (default on if `git lfs` present).

CI step:
```bash
npm run typecheck && npm run lint && npm test
OPENGIT_PERF=1 npm test -- --large 2000   # nightly
```

---

## 8. Implementation Notes

### 8.1 Helpers — `tests/integration/helpers.ts` (NEW)

Signatures match the real backend. No `any`.

```ts
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface TestRepo {
  root: string;        // unique per call
  main: string;        // <root>/main
  remote: string;      // <root>/remote.git
  submodule: string;   // <root>/submodule-lib
  worktrees: {
    dashboard: string;
    hotfix: string;
    detached: string;
  };
}

export async function setupTestRepo(opts?: { large?: number; lfs?: boolean }): Promise<TestRepo>;
export async function cleanupTestRepo(root: string): Promise<void>;

// Run git in a worktree; throws on non-zero (use gitOk for non-zero-OK cases).
export function git(workTree: string, args: string[]): string;
export function gitOk(workTree: string, args: string[]): { ok: boolean; stdout: string; stderr: string };

// Disk helpers.
export function writeFile(workTree: string, rel: string, content: string): void;
export function readFile(workTree: string, rel: string): string;
export function exists(workTree: string, rel: string): boolean;

// Repo introspection.
export function currentBranch(workTree: string): string;        // rev-parse --abbrev-ref HEAD
export function headSha(workTree: string): string;              // rev-parse HEAD
export function logSubjects(workTree: string, n?: number): string[];
export function branchExists(workTree: string, name: string): boolean;
export function remoteRefExists(remoteGit: string, ref: string): boolean;
export function hasMergeInProgress(workTree: string): boolean;  // .git/MERGE_HEAD present
export function conflictFiles(workTree: string): string[];       // diff --name-only --diff-filter=U -z

// Availability probes for conditional tests.
export function lfsAvailable(): boolean;
export function gpgAvailable(): boolean;
```

`setupTestRepo` implementation outline:
```ts
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

export async function setupTestRepo(opts = {}): Promise<TestRepo> {
  const root = mkdtempSync(join(tmpdir(), 'opengit-int-'));
  const script = resolve(__dirname, 'setup-test-repo.sh');
  const args = [root];
  if (opts.large) args.push(`--large=${opts.large}`);
  if (opts.lfs === false) args.push('--no-lfs');
  execFileSync(script, args, { stdio: 'pipe', env: { ...process.env, OPENGIT_TEST_ROOT: root } });
  return {
    root,
    main: join(root, 'main'),
    remote: join(root, 'remote.git'),
    submodule: join(root, 'submodule-lib'),
    worktrees: {
      dashboard: join(root, 'wt-feature-dashboard'),
      hotfix: join(root, 'wt-hotfix'),
      detached: join(root, 'wt-detached'),
    },
  };
}
```

### 8.2 Table-driven pattern (use for matrices)

```ts
import { describe, it, expect } from 'vitest';
import { resetBranch } from '../../electron/main/git/operations';

describe.each([
  ['soft',  'staged'],
  ['mixed', 'unstaged'],
  ['hard',  'clean'],
  ['keep',  'preserved'],
] as const)('reset %s', (mode, expectState) => {
  it(`leaves working tree ${expectState}`, async () => {
    const repo = await freshRepo();          // helper: mkdtemp + init + 2 commits + dirty
    const r = await resetBranch(repo, 'HEAD~1', mode);
    expect(r.success).toBe(true);
    // assert expectState ...
  });
});
```

### 8.3 Isolation pattern (per-test re-init)

For suites where each test mutates state and would bleed into the next, copy
`advanced.test.ts`'s `beforeEach` that `rm -rf`s the repo dir and re-inits. For
suites where the full `setupTestRepo` is expensive, prefer one `beforeAll` +
per-test branches (each test creates its own throwaway branch on the shared
repo) and `git reset --hard <baseline>` + `git clean -fdx` in `afterEach`.

### 8.4 Fixtures to populate — `tests/fixtures/`

| File | Purpose |
|------|---------|
| `tests/fixtures/sample.png` | Binary diff test (real PNG, ~100 bytes) |
| `tests/fixtures/large.txt` | 5k-line file for diff perf |
| `tests/fixtures/unicode-name-🎉.txt` | Unicode filename handling |
| `tests/fixtures/gpg-key.txt` | Batch GPG key spec for `--with-gpg` |
| `tests/fixtures/pre-commit-fail.sh` | Failing hook for A.4.5/A.4.4 |

`tests/fixtures/` exists and is currently empty — populate it.

### 8.5 Running

```bash
npm test                       # Layer A unit + integration (Vitest)
npm test -- --large 2000       # with large-repo fixtures
OPENGIT_PERF=1 npm test        # include perf thresholds
OPENGIT_GPG=1 npm test         # include GPG tests
npm run test:e2e               # Layer B (Playwright) — future
```

Add to `package.json`:
```json
"test:integration": "vitest run tests/integration",
"test:perf": "OPENGIT_PERF=1 vitest run tests/integration/perf.test.ts"
```

---

## 9. Traceability matrix (backend function → test ID → file)

Every exported function in `electron/main/git/` must appear below. **A function
with no test row is a coverage gap.**

| File | Function | Test IDs | Test file |
|------|----------|----------|-----------|
| `lifecycle.ts` | `inferCloneRepoName` | A.1.9 | lifecycle.test.ts |
| `lifecycle.ts` | `resolveCreateTarget` | A.1.10 | lifecycle.test.ts |
| `lifecycle.ts` | `buildCloneArgs` | A.1.6–8 | lifecycle.test.ts |
| `lifecycle.ts` | `createRepository` | A.1.4–5 | lifecycle.test.ts |
| `lifecycle.ts` | `cloneRepository` | A.1.6–8 | lifecycle.test.ts |
| `repo.ts` | `openRepo` | A.1.1–3 | lifecycle.test.ts |
| `repo.ts` | `getStatus` | A.2.1–2, A.25.6 | reads.test.ts |
| `repo.ts` | `getLog` | A.2.3–6 | reads.test.ts |
| `repo.ts` | `getBranches` | A.2.7–8, A.2.13–14, A.10.1–2 | reads.test.ts, tags.test.ts |
| `repo.ts` | `getRemotes` | A.2.9 | reads.test.ts |
| `repo.ts` | `searchRepository` | A.22.1–7 | search.test.ts |
| `repo.ts` | `getState` | A.2.10–12 | reads.test.ts |
| `repo.ts` | `getDiff` | A.23.1–8 | diff.test.ts |
| `repo.ts` | `getCommitFiles` | A.23.9 | diff.test.ts |
| `repo.ts` | `getFileContent` | A.23.10 | diff.test.ts |
| `operations.ts` | `stagePaths` | A.3.1, A.3.10–11, A.14.4 | working-tree.test.ts |
| `operations.ts` | `stageAll` | A.3.2 | working-tree.test.ts |
| `operations.ts` | `unstagePaths` | A.3.3 | working-tree.test.ts |
| `operations.ts` | `unstageAll` | A.3.4 | working-tree.test.ts |
| `operations.ts` | `discardPaths` | A.3.5 | working-tree.test.ts |
| `operations.ts` | `discardUntracked` | A.3.6 | working-tree.test.ts |
| `operations.ts` | `stageHunks` | A.3.7–8 | working-tree.test.ts |
| `operations.ts` | `unstageHunks` | A.3.9 | working-tree.test.ts |
| `operations.ts` | `createCommit` | A.4.1–8 | commit.test.ts |
| `operations.ts` | `checkoutBranch` | A.5.1–4 | branches.test.ts |
| `operations.ts` | `getConflictVersions` | A.14.1–3 | conflict.test.ts |
| `operations.ts` | `createBranch` | A.5.5–6 | branches.test.ts |
| `operations.ts` | `deleteBranch` | A.5.7–9 | branches.test.ts |
| `operations.ts` | `renameBranch` | A.5.10 | branches.test.ts |
| `operations.ts` | `setUpstream` | A.5.11 | branches.test.ts |
| `operations.ts` | `fetchRemote` | A.6.1–3, C.1 | remotes.test.ts |
| `operations.ts` | `pullRemote` | A.6.5–8, A.7.1–2 | remotes.test.ts |
| `operations.ts` | `fetchAllRemotes` | A.6.4 | remotes.test.ts |
| `operations.ts` | `pushRemote` | A.6.9–13, A.7.1–3 | remotes.test.ts |
| `operations.ts` | `probeState` | A.25.* (via getStatus/getState) | reads.test.ts |
| `operations.ts` | `listStashes` | A.8.1–2 | stash.test.ts |
| `operations.ts` | `createStash` | A.8.1–4 | stash.test.ts |
| `operations.ts` | `applyStash` | A.8.5, A.8.9–10 | stash.test.ts |
| `operations.ts` | `popStash` | A.8.6 | stash.test.ts |
| `operations.ts` | `dropStash` | A.8.7 | stash.test.ts |
| `operations.ts` | `mergeBranch` | A.13.1–6 | merge.test.ts |
| `operations.ts` | `rebaseBranch` | A.15.1–2 | rebase.test.ts |
| `operations.ts` | `rebaseInteractivePlan` | A.15.6 | rebase.test.ts |
| `operations.ts` | `applyRebaseInteractive` | A.15.7–10 | rebase.test.ts |
| `operations.ts` | `cherryPick` | A.16.1–4 | cherry-pick.test.ts |
| `operations.ts` | `revertCommits` | A.16.5–7 | cherry-pick.test.ts |
| `operations.ts` | `abortOperation` | A.15.3, A.25.* | rebase.test.ts |
| `operations.ts` | `continueOperation` | A.14.5, A.15.5 | conflict.test.ts, rebase.test.ts |
| `operations.ts` | `skipOperation` | A.15.4 | rebase.test.ts |
| `operations.ts` | `resetBranch` | A.17.1–5 | reset.test.ts |
| `operations.ts` | `undoAction` | A.18.1–10 | undo.test.ts |
| `operations.ts` | `listWorktrees` | A.9.1, A.9.11 | worktree.test.ts |
| `operations.ts` | `createWorktree` | A.9.2–4 | worktree.test.ts |
| `operations.ts` | `removeWorktree` | A.9.7, A.9.10 | worktree.test.ts |
| `operations.ts` | `pruneWorktrees` | A.9.9 | worktree.test.ts |
| `operations.ts` | `lockWorktree` | A.9.5 | worktree.test.ts |
| `operations.ts` | `unlockWorktree` | A.9.6 | worktree.test.ts |
| `operations.ts` | `removeWorktreeAndBranch` | A.9.8 | worktree.test.ts |
| `operations.ts` | `verifyCommit` | A.24.1–3 | verify.test.ts |
| `operations.ts` | `stashDiff` | A.8.8 | stash.test.ts |
| `operations.ts` | `getBlame` | A.19.1–3 | blame.test.ts |
| `operations.ts` | `listSubmodules` | A.11.1, A.11.4 | submodules.test.ts |
| `operations.ts` | `initSubmodules` | A.11.2 | submodules.test.ts |
| `operations.ts` | `deinitSubmodule` | A.11.3 | submodules.test.ts |
| `operations.ts` | `listLFSTracked` | A.12.1, A.12.4 | lfs.test.ts |
| `operations.ts` | `lfsTrack` | A.12.2 | lfs.test.ts |
| `operations.ts` | `lfsUntrack` | A.12.3 | lfs.test.ts |
| `previews.ts` | `mergePreview` | A.21.1–2 | previews.test.ts |
| `previews.ts` | `pullPreview` | A.21.3 | previews.test.ts |
| `previews.ts` | `pushPreview` | A.21.4 | previews.test.ts |
| `previews.ts` | `rebasePlan` | A.21.5 | previews.test.ts |
| `previews.ts` | `previewCommits` | A.21.6 | previews.test.ts |
| `previews.ts` | `previewFiles` | A.21.7 | previews.test.ts |
| `compare.ts` | `compareBranches` | A.20.1–4 | compare.test.ts |
| `client.ts` | `discoverGitBin` | B.1 | errors.test.ts |
| `client.ts` | `gitRun` | D.1–4 (log) | log.test.ts |
| `client.ts` | `gitText` | (indirect via reads) | — |
| `client.ts` | `cancelAll` | C.2–3 | concurrency.test.ts |
| `parse/*.ts` | all parsers | unit tests (`tests/unit/parsers.test.ts`) | — |

---

## 10. Known gaps surfaced by this plan

These must be resolved (either by implementing the missing backend, or by
marking the UI scenario as out-of-scope) before Layer A is complete.

| # | Gap | Impact | Recommendation |
|---|-----|--------|----------------|
| G.1 | No `createTag` / `deleteTag` backend or IPC channel | UI 10.2/10.3 untestable; A.10 only covers reads | Add `tagOperations.ts` with `createTag(workTree, name, start, annotated?, message?)` and `deleteTag(workTree, name)`, wire `TAG_CREATE`/`TAG_DELETE` IPC, then add A.10.3–4. |
| G.2 | `createCommit` has no `gpgSign` / SSH signing option (only `signoff`, which is different) | UI 4.4 "Sign commit" cannot be backed | Add `sign?: { method: 'gpg' \| 'ssh'; key?: string }` to `CommitOptions`, pass `-S` + `commit.gpgsign`/`gpg.format`. Until then, mark A.4.8 as the only sign path (via repo config, not per-commit). |
| G.3 | No public log-emitter hook for Layer A | Section 2.D can't subscribe | Export `subscribeLog(cb): () => void` from `client.ts` (the IPC layer already pushes `LogEntry`; just expose the same emitter). |
| G.4 | `NotSupported` error code has no provocation path on modern git | B.9 can't run | Either delete the code or add a version-gated path (e.g. rebase `--rebase-merges` on git <2.22). |
| G.5 | `listSubmodules` does not return `url` (always `''`) | A.11.1 can't assert url | Fix parser to read `.gitmodules` for url. |
| G.6 | No `branch:setUpstream` UI scenario for remote-tracking branch | A.5.11 covers fn only | Add UI row in 2.5. |
| G.7 | `OperationKind` enum is `'merge' \| 'rebase' \| 'cherry-pick' \| 'revert'` but `undoAction` switch has `case 'branch-create'/'branch-delete'/'stash-apply'/'stash-pop'` not in that enum | A.18 uses kinds outside the IPC enum | Either widen `OperationKind` or document `undoAction`'s `kind` as a separate string union and type it in `shared/ipc.ts`. |
| G.8 | No test for `gitText` rejection path (e.g. `getLog` on empty repo throws) | A.2.* assumes commits exist | Add A.2.15: `getLog` on a repo with zero commits throws `GitError` (or returns empty — pin the current behavior). |
| G.9 | `cancelAll` kills ALL tracked children; no per-call cancel ID at Layer A | C.2 is coarse | Acceptable for now; document. |

---

## 11. Implementation order (suggested)

1. `helpers.ts` + `setup-test-repo.sh` (unblocks everything).
2. Fix the v1 setup-script issues (§1.1) — or the helpers will inherit them.
3. `lifecycle.test.ts`, `reads.test.ts` (foundational; prove the repo opens and reads work).
4. Expand `writes.test.ts` → `working-tree.test.ts` + `commit.test.ts`.
5. `branches.test.ts`, `remotes.test.ts`, `stash.test.ts`, `reset.test.ts`.
6. Expand `worktree.test.ts`; add `submodules.test.ts`, `lfs.test.ts`.
7. Expand `advanced.test.ts` → `merge.test.ts`, `rebase.test.ts`, `cherry-pick.test.ts`, `conflict.test.ts`.
8. `undo.test.ts`, `blame.test.ts`, `compare.test.ts`, `previews.test.ts`, `search.test.ts`, `diff.test.ts`, `verify.test.ts`.
9. `errors.test.ts`, `concurrency.test.ts`, `log.test.ts`, `perf.test.ts`.
10. Address gaps G.1–G.9 as they block tests.
11. Update `package.json` scripts (§8.5) and CI workflow.

When a test file is added, mark its rows in Section 9 as ✅ in a separate
tracking column (or via a `TESTED.md` checklist) so coverage status is visible.

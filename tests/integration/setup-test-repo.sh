#!/usr/bin/env bash
# Builds a fully-featured OpenGit test repository.
# Usage: setup-test-repo.sh [TEST_ROOT] [--large N] [--no-lfs] [--with-gpg]
set -euo pipefail

TEST_ROOT="${1:-${OPENGIT_TEST_ROOT:-$(mktemp -d -t opengit-test-XXXXXX)}}"
REPO="$TEST_ROOT/main"
LARGE=0
DO_LFS=1
DO_GPG=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --large) LARGE="${2:-2000}"; shift ;;
    --large=*) LARGE="${1#*=}" ;;
    --no-lfs) DO_LFS=0 ;;
    --with-gpg) DO_GPG=1 ;;
    --) break ;;
    *) ;;
  esac
  shift
done

git_init_with_identity() {
  git init -q -b main "$1"
  git -C "$1" config user.name  "Test User"
  git -C "$1" config user.email "test@opengit.dev"
  git -C "$1" config commit.gpgsign false
  git -C "$1" config core.autocrlf false
  git -C "$1" config protocol.file.allow always
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
mkdir -p src
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
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x08\x00\x00\x00\x08\x08\x02\x00\x00\x00' > assets/logo.png
git add assets/logo.png && git commit -q -m "Add binary PNG asset"

# ── File-mode change fixture ──
mkdir -p scripts
printf '#!/usr/bin/env bash\necho hi\n' > scripts/run.sh
git add scripts/run.sh && git commit -q -m "Add shell script"
chmod +x scripts/run.sh
git update-index --chmod=+x scripts/run.sh
git commit -q -m "Make run.sh executable"

# ── Unicode / emoji commit (for rendering edge case) ──
printf 'export const emoji = "🎉";\n' > src/emoji.ts
git add src/emoji.ts
git commit -q -m "Add 漢字 emoji 🎉 support"

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
git worktree add --detach "$TEST_ROOT/wt-detached" v1.0.0

# ── Remote setup (local bare repo as remote) ──
REMOTE="$TEST_ROOT/remote.git"
git init --bare -q -b main "$REMOTE"
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
git -c protocol.file.allow=always submodule add -q "$SUBMODULE" libs/submodule-lib
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

# ── Uncommitted changes: staged + unstaged + untracked (for WIP bar) ──
# Must be at the very end so stashes and branch checkouts don't remove them.
printf 'TODO: refactor auth\n' >> src/auth.ts          # unstaged (tracked)
printf "export const version = '1.0.0';\n" > src/config.ts
git add src/config.ts                                    # staged
printf 'export function newFeature() {}\n' > src/new-feature.ts  # untracked

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

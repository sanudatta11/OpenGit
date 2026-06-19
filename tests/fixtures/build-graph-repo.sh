#!/bin/bash
# Build a synthetic git repo with diverse graph patterns for testing.
# Usage: bash tests/fixtures/build-graph-repo.sh [output-dir]
# Default output: /tmp/graph-test-repo
#
# Creates: main branch (20 commits), 10 feature branches (5 commits each,
# no-ff merged), 5 release branches with tags (v1.0.0–v5.0.0), hotfix branches,
# multiple-merge (octopus) commit, detached HEAD test data.
#
# Total: ~100 commits, ~15 branches, ~20 merge commits, ~5 tags.

set -eu

REPO_DIR="${1:-/tmp/graph-test-repo}"

echo "=== Building graph test repo at $REPO_DIR ==="

rm -rf "$REPO_DIR"
mkdir -p "$REPO_DIR"
cd "$REPO_DIR"
git init -q
git config user.email "test@opengit.dev"
git config user.name "OpenGit Test"
git config commit.gpgsign false

# ── Initial commits on main ──
echo "Creating initial commits on main..."

for i in $(seq 1 20); do
  echo "main-${i}" >> main.txt
  git add main.txt 2>/dev/null || true
  git commit -q -m "main: commit ${i}"
done

MAIN_BASE=$(git rev-parse HEAD~10)

# ── Feature branches ──
echo "Creating feature branches..."

for feature in login payment dashboard notifications settings profile search export analytics theme; do
  git checkout -q -b "feature/${feature}" "$MAIN_BASE" 2>/dev/null || true
  for i in $(seq 1 5); do
    echo "${feature}-${i}" >> "feature-${feature}.txt"
    git add "feature-${feature}.txt" 2>/dev/null || true
    git commit -q -m "feature/${feature}: step ${i}"
  done
  git checkout -q main
  git merge --no-ff -q "feature/${feature}" -m "Merge feature/${feature} into main"
done

# ── Release branches with tags ──
echo "Creating release branches and tags..."

for ver in 1.0.0 2.0.0 3.0.0 4.0.0 5.0.0; do
  git checkout -q -b "release/v${ver}" HEAD~3
  echo "release-${ver}" > "release-${ver}.txt"
  git add "release-${ver}.txt" 2>/dev/null || true
  git commit -q -m "Release v${ver}"
  git tag -a -m "Version ${ver}" "v${ver}"
  git checkout -q main
  git merge --no-ff -q "release/v${ver}" -m "Merge release/v${ver} into main"
done

# ── Hotfix branches ──
echo "Creating hotfix branches..."

for hotfix in "critical-crash" "security-patch"; do
  git checkout -q -b "hotfix/${hotfix}" HEAD~5
  echo "hotfix-${hotfix}" > "hotfix-${hotfix}.txt"
  git add "hotfix-${hotfix}.txt" 2>/dev/null || true
  git commit -q -m "hotfix/${hotfix}: fix applied"
  git checkout -q main
  git merge --no-ff -q "hotfix/${hotfix}" -m "Merge hotfix/${hotfix} into main"
done

# ── Octopus merge (3 parents) ──
echo "Creating octopus merge..."

git checkout -q -b octo-a HEAD~2
echo "octo-a" > octo-a.txt
git add octo-a.txt && git commit -q -m "Octopus branch A"

git checkout -q -b octo-b HEAD~2
echo "octo-b" > octo-b.txt
git add octo-b.txt && git commit -q -m "Octopus branch B"

# Clean any pending conflicts before merge
git checkout -q main
git merge --no-ff -q -m "Octopus merge: A + B + feature/login" octo-a octo-b "feature/login" 2>/dev/null || {
  git reset -q --merge 2>/dev/null || true
  echo "  (octopus merge skipped — conflicts)"
}

# ── Detached HEAD test data ──
echo "Creating detached HEAD test scenario..."

git checkout -q -b "temp-detach" HEAD~1
echo "detached" > detached.txt
git add detached.txt && git commit -q -m "Commit for detached HEAD test"
DETACH_SHA=$(git rev-parse HEAD)
git checkout -q "$DETACH_SHA" 2>/dev/null || true
# Switch back to main for clean state
git checkout -q main

# ── Remote tracking branch simulation (local refs/remotes/origin/) ──
echo "Creating remote tracking refs..."

git branch "origin/main" main 2>/dev/null || true
git branch "origin/develop" HEAD~10 2>/dev/null || true

# ── Stats ──
echo ""
echo "=== Graph test repo created ==="
echo "  Path:      $REPO_DIR"
echo "  Commits:   $(git rev-list --count HEAD)"
echo "  Branches:  $(git branch -a | wc -l)"
echo "  Tags:      $(git tag | wc -l)"
echo "  Merges:    $(git log --merges --oneline | wc -l)"

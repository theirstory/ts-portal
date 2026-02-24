#!/usr/bin/env bash
# Create a branch with only structural/code changes for a PR to theirstory/ts-portal.
# Excludes: public/, json/, config.json, *.tar.gz (and other project-specific data).
#
# Usage:
#   ./scripts/create-contrib-pr-branch.sh [upstream] [upstream-branch] [source-branch] [new-branch-name]
# Defaults: upstream=upstream, base=main, source=HEAD, new branch=contrib-to-upstream
set -e
cd "$(git rev-parse --show-toplevel)"

UPSTREAM="${1:-upstream}"
UPSTREAM_BRANCH="${2:-main}"
SOURCE_BRANCH="${3:-HEAD}"
CONTRIB_BRANCH="${4:-contrib-to-upstream}"

echo "Creating contribution branch: $CONTRIB_BRANCH"
echo "  from: $SOURCE_BRANCH (your changes)"
echo "  base: $UPSTREAM/$UPSTREAM_BRANCH (upstream)"
echo "  excluding: public/, json/, config.json, weaviate-data.tar.gz, *.tar.gz"
echo ""

# Ensure we have latest upstream
git fetch "$UPSTREAM" 2>/dev/null || true

# List of files that would be in the diff (structural changes only).
# Excludes: public/, json/, config.json, *.tar.gz and other project-specific data.
FILES=$(git diff --name-only "$UPSTREAM/$UPSTREAM_BRANCH" "$SOURCE_BRANCH" -- . ':!public' ':!json' ':!config.json' ':!*.tar.gz')
if [ -z "$FILES" ]; then
  echo "No structural changes found. Check your branches (e.g. run: git fetch upstream)."
  exit 1
fi

echo "Structural-only files to include:"
echo "$FILES" | sed 's/^/  /'
echo ""

# Create branch from upstream
git checkout -B "$CONTRIB_BRANCH" "$UPSTREAM/$UPSTREAM_BRANCH"

# Check out each changed file from the source branch (brings only those files)
echo "$FILES" | while read -r f; do
  [ -z "$f" ] && continue
  if git show "$SOURCE_BRANCH:$f" &>/dev/null; then
    git checkout "$SOURCE_BRANCH" -- "$f"
    echo "  + $f"
  fi
done

echo ""
echo "Done. Branch '$CONTRIB_BRANCH' has only structural changes."
echo "Review with: git status && git diff --stat $UPSTREAM/$UPSTREAM_BRANCH"
echo "Then commit and push:"
echo "  git add -A && git commit -m 'feat: indexes page and related structural changes for upstream'"
echo "  git push origin $CONTRIB_BRANCH"
echo "Then open a PR from origin/$CONTRIB_BRANCH to theirstory/ts-portal (main)."

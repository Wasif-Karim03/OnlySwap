#!/usr/bin/env bash
# Pushes the current branch (and tags) to GitHub. Output: push.log.
cd "$(dirname "$0")/../.." || exit 1
branch=$(git branch --show-current)
git push -u origin "$branch" --tags > push.log 2>&1
echo "exit $? branch $branch $(date)" >> push.log
echo "Open a pull request: https://github.com/Wasif-Karim03/OnlySwap/compare/main...$branch?expand=1" >> push.log

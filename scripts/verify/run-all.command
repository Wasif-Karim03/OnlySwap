#!/usr/bin/env bash
# Double-click in Finder: runs the whole-build verification on this Mac, saves
# the output to verify-output.log (git-ignored), then pushes the branch and tags.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
{
  echo "started $(date)"
  open -ga Docker 2>/dev/null
  for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 3; done
  bash scripts/verify/all.sh
  echo "verify exit: $?"
  echo "=== push"
  git push -u origin build/s17-onward --tags
  echo "push exit: $?"
  echo "finished $(date)"
} 2>&1 | tee verify-output.log

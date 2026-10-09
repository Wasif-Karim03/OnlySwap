#!/usr/bin/env bash
# Opens a pull request for the current branch, waits for the checks, and merges
# it into main, all from Terminal with the GitHub CLI (free).
#   bash scripts/verify/pr.command            open + wait + merge
#   bash scripts/verify/pr.command --no-merge open + wait only
# First run: installs `gh` with Homebrew and asks you to log in to GitHub in the
# browser (no password or token is typed here). Output: pr.log (git-ignored).
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
set -o pipefail
LOG=pr.log
: > "$LOG"
say() { echo "== $*" | tee -a "$LOG"; }

command -v gh >/dev/null 2>&1 || { say "Installing GitHub CLI"; brew install gh || exit 1; }
gh auth status >/dev/null 2>&1 || { say "Log in to GitHub (a browser opens)"; gh auth login --web --git-protocol https --hostname github.com || exit 1; }

branch=$(git branch --show-current)
[ "$branch" = "main" ] && { say "You're on main. Switch to a feature branch first."; exit 1; }

say "Pushing $branch"
git push -u origin "$branch" 2>&1 | tail -2 | tee -a "$LOG"

if ! gh pr view "$branch" --json number >/dev/null 2>&1; then
  say "Opening a pull request"
  title="${PR_TITLE:-$(echo "$branch" | sed -E 's#^[a-z]+/##; s/-/ /g')}"
  body=$(printf 'Commits on this branch:\n\n%s\n\nOpened from Terminal with scripts/verify/pr.command.' \
    "$(git log --format='- %s' origin/main..HEAD)")
  gh pr create --base main --head "$branch" --title "$title" --body "$body" 2>&1 | tee -a "$LOG"
fi
url=$(gh pr view "$branch" --json url -q .url)
say "Pull request: $url"

say "Waiting for CI on this commit (a few minutes)"
sha=$(git rev-parse HEAD)
run=""
for i in $(seq 1 30); do
  run=$(gh run list --branch "$branch" --workflow CI --json databaseId,headSha \
    -q "map(select(.headSha == \"$sha\")) | .[0].databaseId // empty" 2>/dev/null)
  [ -n "$run" ] && break
  sleep 10
done
if [ -z "$run" ]; then
  say "CI didn't start within 5 minutes. Paste pr.log to Claude."
  exit 1
fi
if gh run watch "$run" --exit-status --interval 20 2>&1 | tail -25 | tee -a "$LOG"; then
  say "All checks passed"
else
  say "CI failed. Paste pr.log to Claude (details: gh run view $run --log-failed)."
  gh run view "$run" --log-failed 2>&1 | tail -60 >> "$LOG"
  exit 1
fi

[ "$1" = "--no-merge" ] && { say "Not merging (--no-merge)"; exit 0; }
say "Merging into main"
gh pr merge "$branch" --merge 2>&1 | tee -a "$LOG" || exit 1
git fetch origin main -q && say "main on GitHub is now $(git rev-parse --short origin/main)"
echo "exit 0 $(date)" >> "$LOG"

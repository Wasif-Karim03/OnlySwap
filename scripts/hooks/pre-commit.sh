#!/usr/bin/env bash
# Pre-commit secret scan (P1-ENV-02). Installed by `pnpm i` via simple-git-hooks.
# Blocks the commit when gitleaks finds a secret in the staged changes.
set -euo pipefail

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "pre-commit: gitleaks is not installed, so the secret scan can't run."
  echo "Install it with: brew install gitleaks"
  exit 1
fi

gitleaks git --pre-commit --staged --redact --no-banner --config .gitleaks.toml

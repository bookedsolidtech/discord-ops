#!/bin/sh
# .husky/pre-commit — secret scan on staged files before commit
#
# Gates (in order):
#   1. gitleaks protect --staged (if gitleaks is available)
#   2. .env file staged check (always — no gitleaks dependency)
#
# Exit codes:
#   0 = all gates passed
#   1 = gate failed — commit blocked

set -e

# ── Gate 1: gitleaks staged scan ──────────────────────────────────────────────
if command -v gitleaks >/dev/null 2>&1; then
  echo "pre-commit: running gitleaks on staged files..."
  if ! gitleaks protect --staged --no-banner 2>&1; then
    echo ""
    echo "ERROR: gitleaks detected potential secrets in staged files."
    echo "Review the output above, remove credentials, then re-stage."
    echo ""
    echo "To allowlist a false positive, add it to .gitleaks.toml [allowlist]"
    exit 1
  fi
  echo "pre-commit: gitleaks scan passed"
else
  echo "pre-commit: gitleaks not installed — skipping secret scan"
  echo "  Install: https://github.com/gitleaks/gitleaks#installing"
fi

# ── Gate 2: .env file staged check ────────────────────────────────────────────
STAGED_ENV=$(git diff --cached --name-only 2>/dev/null | grep -E '^\.env($|\.)' | grep -v '\.example$' | grep -v '\.sample$' || true)

if [ -n "$STAGED_ENV" ]; then
  echo ""
  echo "ERROR: Staged files include .env credential files:"
  echo "$STAGED_ENV" | while IFS= read -r f; do echo "  $f"; done
  echo ""
  echo ".env files must not be committed. Add to .gitignore:"
  echo "  echo '.env' >> .gitignore"
  echo ""
  exit 1
fi

exit 0

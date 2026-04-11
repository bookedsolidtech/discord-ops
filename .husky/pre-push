#!/bin/sh
# .husky/pre-push — full quality gate before push
#
# Enforces zero-bad-code policy: NOTHING reaches the remote without passing
# all available quality gates. Every gate that exists in the project runs.
#
# Gates (skipped gracefully if script/tool not present):
#   1. Format check  (prettier --check .)
#   2. Lint          (eslint .)
#   3. Type check    (tsc --noEmit)
#   4. Tests         (vitest run / jest / node --test)
#   5. Build         (npm run build / pnpm run build)
#
# Exit codes:
#   0 = all applicable gates passed
#   1 = a gate failed — push blocked

set -e

FAILED=""

# ── Detect package manager ────────────────────────────────────────────────────
PKG_MANAGER="npm"
if [ -f "pnpm-lock.yaml" ]; then
  PKG_MANAGER="pnpm"
elif [ -f "yarn.lock" ]; then
  PKG_MANAGER="yarn"
fi

run_script() {
  local SCRIPT_NAME="$1"
  local LABEL="$2"

  # Check if script exists in package.json
  if [ -f "package.json" ]; then
    if node -e "const p=require('./package.json');if(!p.scripts||!p.scripts['${SCRIPT_NAME}'])process.exit(1);" 2>/dev/null; then
      echo "pre-push: running ${LABEL}..."
      if ! $PKG_MANAGER run "$SCRIPT_NAME" 2>&1; then
        echo ""
        echo "ERROR: ${LABEL} failed — push blocked."
        echo "Fix the issues above and re-push."
        echo ""
        FAILED="$FAILED $SCRIPT_NAME"
      fi
    fi
  fi
}

# ── Gate 1: Format check ──────────────────────────────────────────────────────
run_script "format:check" "Prettier format check"

# ── Gate 2: Lint ──────────────────────────────────────────────────────────────
run_script "lint" "ESLint"

# ── Gate 3: Type check ────────────────────────────────────────────────────────
run_script "type-check" "TypeScript type check"

# ── Gate 4: Tests ─────────────────────────────────────────────────────────────
run_script "test" "Test suite"

# ── Gate 5: Build ─────────────────────────────────────────────────────────────
run_script "build" "Build"

# ── Report ────────────────────────────────────────────────────────────────────
if [ -n "$FAILED" ]; then
  echo "pre-push: FAILED gates:$FAILED"
  echo "All quality gates must pass before push. Fix failures and retry."
  exit 1
fi

echo "pre-push: all quality gates passed"
exit 0

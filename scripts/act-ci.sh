#!/usr/bin/env bash
# scripts/act-ci.sh — Run CI locally via nektos/act
# Usage: ./scripts/act-ci.sh [--job <job-name>] [--list] [--local] [--clean] [--native] [--help]
#
# Runs .github/workflows/act-ci.yml — a lightweight mirror of ci.yml that
# avoids GitHub-specific actions (actions/setup-node) which break in act
# due to PATH issues and missing API context.
#
# Available jobs: lint, format, type-check, build, test, quality-gates
# Flags:
#   --job <name>  Run a specific job only
#   --list        List available jobs
#   --help        Show this help message
#   --clean       Remove all stale act containers before running
#   --native      Use linux/arm64 native architecture (no Rosetta emulation)
#   --local       Run local quality gates (no Docker)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Local-gate fallback — runs lint, typecheck, test, build without Docker
# ---------------------------------------------------------------------------
run_local_gates() {
  echo ""
  echo "=== Running local quality gates ==="
  echo ""

  echo "[local/1] eslint..."
  if ! npm run lint 2>&1 | tail -5; then
    echo "  FAILED — lint errors. Fix before pushing."
    return 1
  fi
  echo "  PASSED"

  echo "[local/2] tsc --noEmit..."
  if ! npm run typecheck 2>&1 | tail -5; then
    echo "  FAILED — type errors. Fix before pushing."
    return 1
  fi
  echo "  PASSED"

  echo "[local/3] prettier --check..."
  if ! npm run format:check 2>&1 | tail -5; then
    echo "  FAILED — formatting issues. Run: npm run format"
    return 1
  fi
  echo "  PASSED"

  echo "[local/4] vitest run..."
  if ! npm test 2>&1 | tail -15; then
    echo "  FAILED — test failures. Fix before pushing."
    return 1
  fi
  echo "  PASSED"

  echo "[local/5] tsc build..."
  if ! npm run build 2>&1 | tail -5; then
    echo "  FAILED — build errors. Fix before pushing."
    return 1
  fi
  echo "  PASSED"

  echo ""
  echo "=== All local quality gates passed ==="
  echo ""
}

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
JOB=""
LIST=false
LOCAL=false
CLEAN=false
NATIVE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --job)   JOB="$2"; shift 2 ;;
    --list)  LIST=true; shift ;;
    --local) LOCAL=true; shift ;;
    --clean) CLEAN=true; shift ;;
    --native) NATIVE=true; shift ;;
    --help|-h)
      head -17 "$0" | tail -14
      exit 0
      ;;
    *)
      echo "Unknown flag: $1"
      exit 1
      ;;
  esac
done

# ---------------------------------------------------------------------------
# --list: show available jobs
# ---------------------------------------------------------------------------
if $LIST; then
  echo "Available jobs:"
  echo "  lint          — ESLint"
  echo "  format        — Prettier check"
  echo "  type-check    — TypeScript strict check"
  echo "  build         — tsc build"
  echo "  test          — vitest run"
  echo "  quality-gates — Aggregate gate"
  exit 0
fi

# ---------------------------------------------------------------------------
# --local: run without Docker
# ---------------------------------------------------------------------------
if $LOCAL; then
  run_local_gates
  exit $?
fi

# ---------------------------------------------------------------------------
# Docker mode via act
# ---------------------------------------------------------------------------
if ! command -v act &>/dev/null; then
  echo "act not found. Install: brew install act"
  echo "Falling back to --local mode..."
  run_local_gates
  exit $?
fi

if $CLEAN; then
  echo "Cleaning stale act containers..."
  docker ps -a --filter "label=act" -q | xargs -r docker rm -f 2>/dev/null || true
fi

ACT_ARGS=(
  -W .github/workflows/act-ci.yml
  --bind
  --reuse
)

if $NATIVE; then
  ACT_ARGS+=(--container-architecture linux/arm64)
fi

if [[ -n "$JOB" ]]; then
  ACT_ARGS+=(-j "$JOB")
fi

echo "Running: act ${ACT_ARGS[*]}"
act "${ACT_ARGS[@]}"

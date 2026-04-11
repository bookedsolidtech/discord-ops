#!/bin/sh
# .husky/commit-msg — strips AI attribution from commit messages
#
# Removes lines added by AI coding assistants (Claude Code, etc.) that would
# expose AI tooling in client-facing or public git history.
#
# Stripped patterns:
#   Co-Authored-By: Claude ...
#   Co-Authored-By: Sonnet ...
#   Generated with Claude Code
#   🤖 Generated with ...
#   claude.ai
#
# SAFETY: set -e ensures any unexpected error BLOCKS the commit rather than
# silently passing a message with attribution intact.

set -e

COMMIT_MSG_FILE="$1"

# Validate input
if [ -z "$COMMIT_MSG_FILE" ]; then
  echo "ERROR: commit-msg hook received no file path" >&2
  exit 1
fi
if [ ! -f "$COMMIT_MSG_FILE" ]; then
  echo "ERROR: commit message file not found: $COMMIT_MSG_FILE" >&2
  exit 1
fi

# Atomic write: grep to temp, mv to original (no partial-write risk)
TMPFILE=$(mktemp) || { echo "ERROR: mktemp failed" >&2; exit 1; }
trap "rm -f '$TMPFILE'" EXIT

grep -v \
  -e "Co-Authored-By: Claude" \
  -e "Co-Authored-By: Sonnet" \
  -e "Generated with Claude Code" \
  -e "🤖 Generated with" \
  -e "claude.ai" \
  "$COMMIT_MSG_FILE" > "$TMPFILE" || true
# grep -v exits 1 when no lines survive (empty file after stripping) — that's OK

mv "$TMPFILE" "$COMMIT_MSG_FILE" || { echo "ERROR: could not write cleaned message" >&2; exit 1; }

# Normalize trailing newlines (cosmetic, non-fatal)
perl -i -0777 -pe 's/\n+$/\n/' "$COMMIT_MSG_FILE" 2>/dev/null || true

exit 0

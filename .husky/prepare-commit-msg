#!/bin/sh
# rea:prepare-commit-msg v1
# rea:augment-body-v1
#
# Husky prepare-commit-msg hook installed by `rea init` / `rea upgrade`.
# Do NOT edit by hand — the file is refreshed on every rea upgrade.
#
# Governance contract: when policy.attribution.co_author.enabled is
# `true`, append a `Co-Authored-By: <name> <email>` trailer to the
# commit message file. Idempotent on email match (case-insensitive,
# line-anchored). Skips merge commits when policy.attribution.co_author
# .skip_merge is true.
#
# Triggers under all five commit sources git delivers:
#   - $2 unset / empty   (`git commit` with no body provided)
#   - $2 = 'message'     (`git commit -m "..."`)
#   - $2 = 'template'    (commit.template configured)
#   - $2 = 'merge'       (merge commit; honored by skip_merge: true)
#   - $2 = 'squash'      (squash merge / rebase)
#   - $2 = 'commit'      (`git commit --amend`)
#
# Skip conditions:
#   - REA_SKIP_ATTRIBUTION=1 in env (per-invocation override)
#   - .rea/HALT present (kill switch active)
#   - $1 (message file path) missing or not a file
#   - policy.attribution.co_author.enabled !== true
#
# Coexistence: this hook does NOT block on anything. The companion
# `commit-msg` hook (which runs AFTER prepare-commit-msg in git's
# lifecycle) still enforces `block_ai_attribution`. A human trailer
# `Co-Authored-By: Real Name <real@email.tld>` is NOT AI attribution
# (no AI noreply domain, no AI name keyword) and is not blocked.

set -u

COMMIT_MSG_FILE="${1:-}"
COMMIT_SOURCE="${2:-}"

REA_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)

# Forward declaration — the extension-chain runner is defined further
# down (after $REA_ROOT is set so the dir lookup is anchored). We call
# it from every "augmenter skipped" exit point so consumer fragments
# under .husky/prepare-commit-msg.d/* run regardless of whether rea's
# own augmenter ran. The function fires fragments in lex order,
# logs-and-continues on non-zero exits, and is a no-op if the dir is
# absent or empty.
#
# 0.32.0 Phase 3: the pre-0.32.0 layout exited early at every
# precondition gate, which made the extension surface unreachable
# when (a) attribution was disabled, (b) HALT was active, or (c)
# REA_SKIP_ATTRIBUTION was set. The new layout runs the chain at the
# end of every exit path EXCEPT when the message file itself is
# missing/unparseable (no point running fragments against a path that
# doesn't exist).
run_extension_chain() {
  ext_dir="${REA_ROOT}/.husky/prepare-commit-msg.d"
  if [ -d "$ext_dir" ]; then
    for frag in "$ext_dir"/*; do
      [ -e "$frag" ] || continue
      [ -f "$frag" ] || continue
      [ -x "$frag" ] || continue
      if ! "$frag" "$COMMIT_MSG_FILE" "$COMMIT_SOURCE"; then
        printf 'rea: prepare-commit-msg.d fragment exited non-zero: %s (continuing)\n' \
          "$(basename "$frag")" >&2
      fi
    done
  fi
}

# Skip conditions: any missing precondition exits 0 silently. The hook
# is purely additive; refusing here would break commits with no upside.

# Missing message file → nothing to augment AND nothing for fragments
# to act on either. Exit immediately without running the chain.
if [ -z "$COMMIT_MSG_FILE" ] || [ ! -f "$COMMIT_MSG_FILE" ]; then
  exit 0
fi

# Per-invocation override — skip the augmenter, but still run consumer
# fragments. The flag is named REA_SKIP_ATTRIBUTION, not REA_SKIP_HOOK,
# precisely so the rest of the chain runs.
if [ -n "${REA_SKIP_ATTRIBUTION:-}" ]; then
  run_extension_chain
  exit 0
fi

# HALT kill switch — refuse to mutate anything while frozen. The
# extension chain is also skipped under HALT: a frozen system means
# "no agent-side actions" and consumer fragments are agent-side too.
if [ -f "${REA_ROOT}/.rea/HALT" ]; then
  exit 0
fi

POLICY_FILE="${REA_ROOT}/.rea/policy.yaml"
if [ ! -f "$POLICY_FILE" ]; then
  run_extension_chain
  exit 0
fi

# Delegate policy reads to the canonical rea CLI when available so we
# get the zod-validated document regardless of whether the operator
# wrote block-form (`attribution:\n  co_author:\n    enabled: true`)
# or inline-form (`attribution: { co_author: { enabled: true } }`)
# YAML. Codex round 1 P2: the prior Python inline parser only handled
# block form. When the CLI is unreachable (fresh consumer install
# pre-`pnpm i`, foreign dev environment, …) we fall back to the
# embedded Python state machine — it correctly handles block-form
# YAML, which is what `rea init` writes.
#
# Locator priority mirrors `.husky/pre-push`: project node_modules →
# dogfood dist → PATH.
rea_invoke() {
  if [ -x "${REA_ROOT}/node_modules/.bin/rea" ]; then
    "${REA_ROOT}/node_modules/.bin/rea" "$@"
  elif [ -f "${REA_ROOT}/dist/cli/index.js" ] && [ -f "${REA_ROOT}/package.json" ] && grep -q '"name": *"@bookedsolid/rea"' "${REA_ROOT}/package.json" 2>/dev/null; then
    node "${REA_ROOT}/dist/cli/index.js" "$@"
  elif command -v rea >/dev/null 2>&1; then
    rea "$@"
  else
    return 127
  fi
}

ENABLED=$(rea_invoke hook policy-get attribution.co_author.enabled 2>/dev/null)
REA_RC=$?

# REA_RC interpretation:
#   0          — rea CLI ran and returned a value (or empty for an
#                unset key). Use the CLI reads.
#   non-zero   — rea CLI unreachable (127 sentinel), too old to know
#                `hook policy-get`, OR the policy YAML is unparseable.
#                In every one of those cases the policy file ITSELF
#                may still be valid block-form YAML, so fall back to
#                the embedded python3 parser. The realistic invalid-
#                config case — `enabled: true` with an empty name or
#                email — is caught downstream by the `[ -z "$CO_NAME" ]`
#                defense-in-depth guard, which exits 0 without
#                augmenting regardless of which reader produced the
#                values. (An earlier 0.30.1 revision fail-closed on
#                non-127 exit codes; codex round 1 showed that
#                regressed the supported stale-CLI / pre-`pnpm i` flow,
#                because an old `rea` exits non-zero exactly like an
#                unparseable policy — the two are indistinguishable by
#                exit code.)
if [ "$REA_RC" = "0" ]; then
  CO_NAME=$(rea_invoke hook policy-get attribution.co_author.name 2>/dev/null || printf '')
  CO_EMAIL=$(rea_invoke hook policy-get attribution.co_author.email 2>/dev/null || printf '')
  SKIP_MERGE=$(rea_invoke hook policy-get attribution.co_author.skip_merge 2>/dev/null || printf 'false')
elif command -v python3 >/dev/null 2>&1; then
  # rea CLI unreachable / stale / policy unparseable — fall back to the
  # Python block-form parser.
  CO_AUTHOR_PARSE=$(python3 - "$POLICY_FILE" <<'PY' 2>/dev/null
import re
import sys

path = sys.argv[1]
try:
    with open(path, 'r', encoding='utf-8') as fh:
        lines = fh.readlines()
except OSError:
    print('false'); print(''); print(''); print('false'); sys.exit(0)

in_attr = False
in_co = False
enabled = 'false'
name = ''
email = ''
skip_merge = 'false'

def strip_value(raw):
    raw = raw.rstrip('\n').rstrip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in ("'", '"'):
        return raw[1:-1]
    if '#' in raw:
        raw = raw.split('#', 1)[0].rstrip()
    return raw

for line in lines:
    stripped_line = line.rstrip('\n')
    if re.match(r'^\s*#', stripped_line):
        continue
    if re.match(r'^attribution:\s*(#.*)?$', stripped_line):
        in_attr = True; in_co = False; continue
    if in_attr and re.match(r'^\S', stripped_line):
        in_attr = False; in_co = False
    if in_attr and re.match(r'^\s+co_author:\s*(#.*)?$', stripped_line):
        in_co = True; continue
    if in_co:
        m = re.match(r'^(\s*)\S', stripped_line)
        if m and len(m.group(1)) <= 2:
            in_co = False; continue
        if re.search(r'enabled:\s*true(\s|$)', stripped_line):
            enabled = 'true'
        elif re.search(r'enabled:\s*false(\s|$)', stripped_line):
            enabled = 'false'
        if re.search(r'skip_merge:\s*true(\s|$)', stripped_line):
            skip_merge = 'true'
        elif re.search(r'skip_merge:\s*false(\s|$)', stripped_line):
            skip_merge = 'false'
        m = re.search(r'name:\s*(.*)$', stripped_line)
        if m:
            name = strip_value(m.group(1))
        m = re.search(r'email:\s*(.*)$', stripped_line)
        if m:
            email = strip_value(m.group(1))

print(enabled); print(name); print(email); print(skip_merge)
PY
)
  if [ -z "$CO_AUTHOR_PARSE" ]; then
    run_extension_chain
    exit 0
  fi
  ENABLED=$(printf '%s\n' "$CO_AUTHOR_PARSE" | sed -n '1p')
  CO_NAME=$(printf '%s\n' "$CO_AUTHOR_PARSE" | sed -n '2p')
  CO_EMAIL=$(printf '%s\n' "$CO_AUTHOR_PARSE" | sed -n '3p')
  SKIP_MERGE=$(printf '%s\n' "$CO_AUTHOR_PARSE" | sed -n '4p')
else
  # Neither rea CLI nor python3 reachable — silent no-op for the
  # augmenter, but still run consumer fragments. The chain doesn't
  # need policy values; it just runs `.husky/prepare-commit-msg.d/*`.
  run_extension_chain
  exit 0
fi

if [ "$ENABLED" != "true" ]; then
  run_extension_chain
  exit 0
fi

# Defense-in-depth: if we got here with enabled=true but no identity,
# the policy loader's cross-field refinement was bypassed (or someone
# edited the YAML around the load path). Bail without augmenting and
# emit a stderr advisory so the operator sees the misconfig at commit
# time. We deliberately do NOT exit non-zero — refusing the commit
# would be more disruptive than the silent no-op (the loader + doctor
# already surface the misconfig at policy load and at `rea doctor`).
#
# When `rea audit record <topic>` lands in a future release this
# branch should emit a `rea.attribution_augmented_invalid_config`
# record instead of stderr. Tracked as a 0.31.0+ item.
if [ -z "$CO_NAME" ] || [ -z "$CO_EMAIL" ]; then
  printf 'rea: attribution.co_author.enabled=true but %s%s%s is empty — augmenter no-op.\n' \
    "$([ -z "$CO_NAME" ] && printf name)" \
    "$([ -z "$CO_NAME" ] && [ -z "$CO_EMAIL" ] && printf '+')" \
    "$([ -z "$CO_EMAIL" ] && printf email)" >&2
  printf 'rea: edit .rea/policy.yaml — set name + email, OR set enabled: false.\n' >&2
  run_extension_chain
  exit 0
fi

# skip_merge: true → skip when commit source is 'merge'.
if [ "$SKIP_MERGE" = "true" ] && [ "$COMMIT_SOURCE" = "merge" ]; then
  run_extension_chain
  exit 0
fi

# Idempotency: scan the current message file for a Co-Authored-By line
# that names the same email (case-insensitive). Line-anchored — body
# prose mentioning the email in passing does NOT count.
LOWER_EMAIL=$(printf '%s' "$CO_EMAIL" | tr '[:upper:]' '[:lower:]')
# grep -E with case-insensitive flag; portable across BSD + GNU grep.
# The pattern: ^co-authored-by: <anything> <EMAIL>[ws]*$
# Email is regex-escaped via the conservative approach: assume the
# email passed policy validation (only safe chars per loader regex
# /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/), so the only metachars present
# are `.` and possibly `+` / `-`. We escape `.` and rely on the
# permissive char set.
ESCAPED_EMAIL=$(printf '%s' "$LOWER_EMAIL" | sed 's/[.[\*^$(){}+?|]/\\&/g')
if grep -iE "^co-authored-by:[[:space:]]*[^<]*<${ESCAPED_EMAIL}>[[:space:]]*$" \
  "$COMMIT_MSG_FILE" >/dev/null 2>&1; then
  run_extension_chain
  exit 0
fi

# Build the trailer line. Idempotency above already lower-cased the
# email for comparison; we ship the trailer with the policy-supplied
# casing so the user's preferred display name + email render verbatim.
TRAILER="Co-Authored-By: ${CO_NAME} <${CO_EMAIL}>"

# Find the insert point: at the bottom of the message, after stripping
# trailing blank/comment lines (git's scissors line `# -- >8 --` and
# everything below is appended verbatim to preserve git's own view).
TMP_BODY=$(mktemp "${TMPDIR:-/tmp}/rea-pcm.XXXXXX") || exit 0
TMP_TAIL=$(mktemp "${TMPDIR:-/tmp}/rea-pcm.XXXXXX") || { rm -f "$TMP_BODY"; exit 0; }
trap 'rm -f "$TMP_BODY" "$TMP_TAIL"' EXIT INT TERM

# Split the file: body (above the scissors marker) vs. tail (scissors
# and everything below). Codex round 2 P1: previously used python3
# unconditionally — on environments where rea CLI is reachable but
# python3 is missing, the split silently failed and the user's commit
# body got dropped. awk is universally available on POSIX systems and
# does the same work.
SCISSORS='# ------------------------ >8 ------------------------'
awk -v scissors="$SCISSORS" -v body_dst="$TMP_BODY" -v tail_dst="$TMP_TAIL" '
  BEGIN { found = 0 }
  {
    if (!found && $0 == scissors) found = 1
    if (found) print > tail_dst
    else        print > body_dst
  }
' "$COMMIT_MSG_FILE"

# Determine whether the body's last non-blank/non-comment line is a
# real git trailer (`Key: value` where Key matches `[A-Za-z][-A-Za-z0-9]*`)
# AND part of a multi-line trailer block (not the subject of a single-line
# conventional commit). Codex round 3 P1: the round-2 fix correctly
# rejected commit-prose `: ` patterns but still matched the conventional
# commit subject form `feat: add x` because that line is ALSO
# `[A-Za-z][-A-Za-z0-9]*: <value>`. The right distinguisher: a real
# trailer block has at least one preceding non-blank body line; a bare
# `feat: x` commit is just a subject and always needs a separator.
LAST_BODY_LINE=$(awk '
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*$/ { next }
  { lastline = $0 }
  END { if (lastline != "") print lastline }
' "$TMP_BODY")
BODY_LINE_COUNT=$(awk '
  /^[[:space:]]*#/ { next }
  /^[[:space:]]*$/ { next }
  { count++ }
  END { print count + 0 }
' "$TMP_BODY")

SEPARATOR_NEEDED=1
if [ -z "$LAST_BODY_LINE" ]; then
  SEPARATOR_NEEDED=0
elif [ "$BODY_LINE_COUNT" -gt 1 ] && printf '%s' "$LAST_BODY_LINE" | grep -qE '^[A-Za-z][-A-Za-z0-9]*: '; then
  SEPARATOR_NEEDED=0
fi

# Trim trailing blank lines from the body so the trailer lands cleanly
# (without leaving a triple-newline before it).
TMP_BODY_TRIMMED=$(mktemp "${TMPDIR:-/tmp}/rea-pcm.XXXXXX") || exit 0
awk '
  { lines[NR] = $0; total = NR }
  END {
    end = total
    while (end > 0 && lines[end] ~ /^[[:space:]]*$/) { end-- }
    for (i = 1; i <= end; i++) print lines[i]
  }
' "$TMP_BODY" > "$TMP_BODY_TRIMMED"

# Compose the new file: trimmed body + (optional blank) + trailer + tail.
{
  cat "$TMP_BODY_TRIMMED"
  if [ "$SEPARATOR_NEEDED" -eq 1 ]; then
    printf '\n'
  fi
  printf '%s\n' "$TRAILER"
  if [ -s "$TMP_TAIL" ]; then
    cat "$TMP_TAIL"
  fi
} > "${COMMIT_MSG_FILE}.rea-tmp" && mv "${COMMIT_MSG_FILE}.rea-tmp" "$COMMIT_MSG_FILE"

rm -f "$TMP_BODY_TRIMMED"

# ── Extension-hook chaining ───────────────────────────────────────────────────
# 0.32.0 — `.husky/prepare-commit-msg.d/*` extension surface mirrors
# the `.husky/commit-msg.d/*` and `.husky/pre-push.d/*` patterns from
# 0.13.0. Source every executable file under
# `.husky/prepare-commit-msg.d/` in lexical order. Missing directory
# is a no-op (backward compatible). Each fragment receives the same
# `$1` (commit message file path) and `$2` (commit source) that git
# delivered to this hook so consumers can layer on their own
# augmenters (lint-staged --on-prepare, branch-name-injection,
# ticket-reference-prepend, …) without losing rea coverage.
#
# Fragments run AFTER rea's attribution augmenter so the
# `Co-Authored-By` trailer is already in the file before any consumer
# fragment reads it; that lets a fragment reorder trailers, dedupe,
# or run its own template substitution against the augmented body.
#
# A non-zero exit from a fragment does NOT fail the commit — this
# hook is purely additive (its bash counterpart `commit-msg` is the
# blocking gate). We log the failure to stderr and continue so a
# broken consumer fragment can't take down `git commit`.
#
# The actual chain body lives in `run_extension_chain` (defined near
# the top of the file). The reason for the early definition: several
# augmenter-skip exit paths (enabled: false, missing identity, idempo-
# tency hit, skip_merge match) need to run the chain too, so consumer
# fragments fire regardless of whether rea's own augmenter activated.
run_extension_chain

exit 0

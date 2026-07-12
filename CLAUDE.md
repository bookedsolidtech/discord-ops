<!-- reagent-managed:start -->
<!-- Managed block migrated to @bookedsolid/rea 0.50.0 — see the rea:managed block below. -->

# Agent Behavioral Rules

## Non-Negotiable Rules

These rules are enforced by hooks and cannot be overridden by any agent instruction:

- **NEVER** use `--no-verify` to skip git hooks — hooks are safety gates, not obstacles
- **NEVER** commit secrets, credentials, API keys, or tokens to any file
- **NEVER** force-push to `main`, `master`, `staging`, or `production` branches
- **NEVER** push without all applicable quality gates passing (run `pnpm preflight` or equivalent)
- **NEVER** install packages without verifying they exist in the npm registry first

## Verification Requirements

- Read files before editing them — understand existing code before modifying
- Verify package existence before installing: `npm view <package>` or check npmjs.com
- Confirm current state before claiming status — check git, files, build output
- Check tool availability before assuming it is installed

## Attribution

Do NOT include AI attribution in commits, PR bodies, code comments, or any content. When block_ai_attribution is enabled in .rea/policy.yaml, the commit-msg hook REJECTS commits containing structural AI attribution (Co-Authored-By with AI names, 'Generated with [Tool]' footers, etc.). The attribution-advisory hook also blocks gh pr create/edit and git commit commands with attribution. You must remove all attribution markers before committing — the hooks will NOT silently fix them.

## Human-in-the-Loop Escalation

When you encounter an unexpected blocker, ambiguous requirement, or situation not covered by the current context:

1. **STOP** — do not invent a workaround or make assumptions
2. **Describe** the situation clearly: what you tried, what failed, what you need
3. **Wait** for explicit human instruction before proceeding

The cost of pausing is always lower than the cost of acting incorrectly.

## Policy File

Read `.rea/policy.yaml` at the start of every session to confirm:

- The current `autonomy_level` (L0–L3) — your permitted operation scope
- `blocked_paths` — directories you must never modify
- `max_autonomy_level` — ceiling set by a human; never request escalation beyond it

## Audit Acknowledgment

This session may be subject to audit logging per `.rea/policy.yaml`. All tool invocations may be recorded. Behave as if every action is observed.

## Delegation

This project uses a "bring your own engineering team" model. All non-trivial work flows through the orchestrator to specialist agents.

**CRITICAL: For any non-trivial task, delegate to the `rea-orchestrator` agent FIRST.**

The orchestrator (`subagent_type: "rea-orchestrator"`) is the primary routing layer:

- It reads `.rea/policy.yaml` and checks HALT before any work
- It selects the right specialist agents from `.claude/agents/` based on the task
- It enforces engineering processes, coordinates multi-step work, and ensures quality gates
- It can launch multiple specialists in parallel for maximum throughput

**Fallback**: If the orchestrator is unavailable or the task is narrowly scoped to a single domain, you may route directly to a specialist agent by scanning `.claude/agents/` and using the matching `subagent_type` (e.g., `security-engineer`, `frontend-specialist`, `database-architect`).

**Do NOT** use generic Agent calls without specifying a `subagent_type`. Every agent invocation should target a discoverable specialist from `.claude/agents/`.

Exception: simple read-only questions and direct clarifications may be answered without delegation.

<!-- reagent-managed:end -->

# discord-ops

A Model Context Protocol (MCP) server that exposes Discord bot operations as tools for AI agents. Published as [`@bookedstudios/discord-ops`](https://www.npmjs.com/package/@bookedstudios/discord-ops) on npm.

## Package manager

Use **npm** (not pnpm or yarn).

## Key commands

```bash
npm test              # run vitest test suite
npm run typecheck     # tsc --noEmit
npm run lint          # eslint
npm run build         # compile to dist/
```

## Branch strategy

`dev` → `staging` → `main`

- Feature work on `dev` or feature branches
- `staging` for release candidates
- `main` is the published release branch — merges trigger npm publish via changesets

<!-- rea:managed:start v=1 -->

## REA Governance (managed — do not edit this block)

- **Policy**: `.rea/policy.yaml` — profile `bst-internal`
- **Autonomy**: `L1` (ceiling `L2`)
- **Blocked paths**: 4 entries — see the policy file
- **block_ai_attribution**: `true` (enforced by commit-msg hook)

Protected-path changes (`src/gateway/middleware/`, `hooks/`, `src/policy/`,
`.github/workflows/`) require a `/codex-review` audit entry before push.

Run `rea doctor` to verify the install. Run `rea check` to inspect state.

<!-- rea:managed:end -->

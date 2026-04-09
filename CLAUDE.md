<!-- reagent-managed:start -->
<!-- Managed by @bookedsolid/reagent 0.1.0. Run: npx @bookedsolid/reagent init to update. -->

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

Attribution in internal BST projects is permitted in `.claude/` files and approved team documentation. Strip attribution from any client-facing commits, PR bodies, and public-facing content.

## Human-in-the-Loop Escalation

When you encounter an unexpected blocker, ambiguous requirement, or situation not covered by the current context:

1. **STOP** — do not invent a workaround or make assumptions
2. **Describe** the situation clearly: what you tried, what failed, what you need
3. **Wait** for explicit human instruction before proceeding

The cost of pausing is always lower than the cost of acting incorrectly.

## Policy File

Read `.reagent/policy.yaml` at the start of every session to confirm:
- The current `autonomy_level` (L0–L3) — your permitted operation scope
- `blocked_paths` — directories you must never modify
- `max_autonomy_level` — ceiling set by a human; never request escalation beyond it

## Audit Acknowledgment

This session may be subject to audit logging per `.reagent/policy.yaml`. All tool invocations may be recorded. Behave as if every action is observed.

## Delegation

For non-trivial implementation tasks, delegate to the `reagent-orchestrator` agent before proceeding. The orchestrator enforces BST engineering processes, selects specialist agents, and coordinates multi-step work.

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

# Session Restart Context
_Last updated: 2026-04-03_

## Completed This Session

- Deep test + audit + fact-check pass on v0.20.0
- Live smoke tests: list_projects (M-5 ✓), set_permissions schema rejection ✓, list_channels perm pre-check ✓
- Security fact-checks: all 5 verified (M-2 wiring ✓, M-3 timing ✓, H-4 path ✓, C-2 TOKEN_ENV ✓, H-1 createInvite ✓)
- 5-specialist audit surfaced 11 issues
- Fixed all 11 issues in v0.21.0:
  - SSRF: redirect blocking, 127.0.0.0/8 range, IPv4-mapped IPv6 (hex-normalized form), regex pre-compilation
  - Type safety: all 48 tools migrated to `defineTool<T>()`, 4 real bugs fixed (NotificationType enum, ColorResolvable cast)
  - Config: throw on corrupt file instead of silent empty-config fallback
  - HTTP: ipCounters pruned every 60s
  - Tests: +24 tests → 367 total (perm pre-check, TOKEN_ENV validation, og-fetch IPv6, audit redaction)
- PR #40 opened: staging → main
- Pinged hedoneone in #dev-team

## In Progress

Nothing — clean state. Waiting for PR #40 merge to trigger v0.21.0 npm publish.

## Up Next

1. Merge PR #40 (staging → main) — triggers changeset version bump PR, then publish
2. After publish: verify `npm view discord-ops version` shows 0.21.0
3. Update `.mcp.json` npx cache if needed (it uses `@latest`, should auto-resolve)
4. Consider follow-up items:
   - Port 0 validation in CLI (deferred since before v0.19.0)
   - Rate limiter `stats()` aggregation fix (misleading across buckets)
   - `createInvite` uses `getChannel` (text-only) but perm pre-check uses `getAnyChannel` — minor inconsistency
   - DNS rebinding (inherent limitation, no easy fix without custom DNS resolver)

## Pending Changesets / PRs

- PR #40: staging → main — all 11 audit fixes, changeset for v0.21.0 (patch)

## Key Context & Decisions

- Package name: `discord-ops` on npm (not scoped)
- Branch strategy: `dev` → `staging` → `main`; main triggers publish via changesets
- `BOOKED_DISCORD_BOT_TOKEN` = Booked Solid bot token
- Discord dev-team channel ID: `1489453910413283379` (booked-solid-tech project)
- hedoneone user ID: `820027414902079548`
- Release workflow: merging "Version Packages" PR triggers publish + Discord notification
- v0.21.0: all 11 findings from the post-v0.20.0 audit fixed
- Node.js URL parser quirk: IPv6 hostnames include brackets in `url.hostname` (e.g. `[::1]`), and IPv4-mapped IPv6 is normalized to hex form (e.g. `::ffff:a9fe:a9fe`)

## Repo State

- Branch: staging
- Last commit: `5f65f23` chore: add changeset for v0.21.0
- Working tree: clean

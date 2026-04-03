# Session Restart Context
_Last updated: 2026-04-03_

## Completed This Session

- Implemented all 15 deferred audit findings from the previous session
- Security fixes: H-1, H-2, H-3, H-4, C-2, M-1, M-2, M-3, M-4, M-5
- Structural: CHANNEL_TYPE_MAP extraction, invites.ts split, defineTool<T> factory, BotConnection rejection fix
- 343 tests passing (33 files), +2 new test files (audit, og-fetch)
- Released **v0.20.0** to npm
- Pinged hedoneone (820027414902079548) in #dev-team

## In Progress

Nothing — clean state.

## Up Next (NEXT SESSION: Deep Test + Audit + Fact-Check)

The next session should be a comprehensive verification pass on v0.20.0. Goals:

### 1. Live integration smoke tests
Test the MCP server with a real Discord connection (using `BOOKED_DISCORD_BOT_TOKEN`):
- `health_check` — verify running v0.20.0
- `list_projects` — verify token_env is NOT in the output (M-5)
- `list_channels` with guild_id — verify permission pre-check runs for guild tools
- `delete_channel` (dry-run) — verify requiresGuild perm pre-check triggers for channel tools
- `set_permissions` with invalid flag — verify schema rejects it
- HTTP transport `/health` endpoint — verify no sessions/rateLimiter in response

### 2. Security fact-checks (verify each fix is actually effective)
- **M-2 SSRF**: Confirm `send_embed` with a 169.254.169.254 URL returns empty OG (not a fetch error from Discord API, but blocked in og-fetch)
- **M-3 timing**: Verify HTTP auth with wrong-length token still constant-time (no early return path)
- **H-4 path**: Confirm `DISCORD_OPS_CONFIG=/etc/passwd` throws the .json extension error
- **C-2 TOKEN_ENV**: Confirm `DISCORD_OPS_TOKEN_ENV=lowercase` throws format validation error
- **H-1 channel perms**: Confirm a tool like `delete_channel` triggers perm pre-check when called with channel_id

### 3. 5-specialist audit on the new code
Launch another 5-agent audit focused specifically on the v0.20.0 changes:
- QA Lead: test coverage gaps
- TypeScript Specialist: defineTool<T> usage correctness, any remaining `as any`
- Security Engineer (AppSec): verify each security fix is complete and not bypassable
- Senior Code Reviewer: structural quality of the split files, consistent patterns
- Chief Code Reviewer: surgical review of http.ts changes, config validation, og-fetch SSRF

### 4. Known gaps to investigate
- `send_embed` tool — does it actually call `fetchOgMetadata`? verify the SSRF fix is wired up
- `createInvite` — added `requiresGuild: true` but uses `channel_id`, not `guild_id`. Does the new perm pre-check actually run? (server.ts tries to get guild from channel)
- `set_slowmode` still uses `getChannel` (text-only) but could operate on any text channel — is this intentional or should it use `getAnyChannel`?
- Port 0 validation fix in CLI (deferred from audit before v0.19.0)
- Rate limiter `stats()` reporting fix (aggregated across buckets, misleading)

## Pending Changesets / PRs

None — v0.20.0 released, main and staging in sync.

## Key Context & Decisions

- Package name: `discord-ops` on npm (not scoped)
- Branch strategy: `dev` → `staging` → `main`; main triggers publish via changesets
- `BOOKED_DISCORD_BOT_TOKEN` = Booked Solid bot token
- Discord dev-team channel ID: `1489453910413283379` (booked-solid-tech project)
- hedoneone user ID: `820027414902079548`
- Release workflow: merging "Version Packages" PR triggers publish + Discord notification
- v0.20.0: All 15 deferred security+structural audit findings implemented

## Repo State

- Branch: staging
- Last commit: `9265169` (merge from main — CHANGELOG + package.json updated)
- Working tree: clean

# discord-ops

## 0.19.0

### Minor Changes

- f9c9bd0: Comprehensive security, type safety, and correctness audit fixes (5-specialist review)

  **Security**
  - Fix shell injection in release workflow: use `execFileSync` argv array instead of shell string interpolation for Discord notification step
  - Remove unused `id-token: write` permission from release workflow
  - Guard `PUBLISHED_PACKAGES` JSON parse in CI notify script to prevent spurious workflow failures
  - Inline `DISCORD_OPS_CONFIG` JSON now throws on malformed input instead of silently using empty config

  **Correctness**
  - `delete_channel`: use `getAnyChannel` so voice channels, categories, and forums can be deleted (was text-only)
  - `archive_thread`: use `getAnyChannel` + `isThread()` guard instead of duck-typed `as any` cast
  - `query_audit_log`: return error on unknown `action_type` instead of silently ignoring the filter
  - `notify_owners`: return `isError: true` when project does not exist in config (was silent no-op)
  - `move_channel`: add `requiresGuild: true` so `ManageChannels` permission pre-flight is enforced; use live channel fetch for sibling list to avoid stale-cache race; replace `.refine()` with `.superRefine()` with proper path reporting; use `ChannelType` allowlist instead of fragile duck-type thread guard
  - `setup.ts`: add `"alert"` to wizard `NOTIFICATION_TYPES` list (was missing from enum)

  **Type safety**
  - `server.ts`: replace `(schema as any)._def` with `instanceof z.ZodObject`; move `getTokenForProject` to static import
  - `purge_messages`: replace `as any` with `TextChannel` cast
  - `set_slowmode`: replace `(updated as any).name` with runtime presence check
  - `edit_channel`: replace `as unknown as TextChannel` double-cast with `GuildChannel`
  - `create_webhook`: replace `as any` with `TextChannel` cast
  - `get_webhook`: replace `(owner as any).tag` with `"tag" in` guard
  - `query_audit_log`: replace `(entry.target as any).id` with `"id" in` guard
  - `owners.ts`: replace `as never` cast with proper `NotificationType` parameter type; return `null` for project-not-found vs `""` for no-op

  **Dead code removal**
  - Delete empty `src/cli/health.ts` placeholder (referenced v0.1.0 in a v0.18+ package)
  - Delete unused `src/utils/retry.ts` (exported but never imported)
  - Remove dead `properties` array and `void` suppressor in `og-fetch.ts`
  - Remove stale doc comment from `templates/registry.ts`
  - Remove always-true ternary `STATUS_ICONS.success ? { icon_url: ... } : {}` in release template footer
  - Remove unused `key` variable in `validate.ts` channel loop
  - Remove unnecessary `[...result]` spread in `list-members.ts`
  - Deduplicate `channel.threads.create` call in `create-thread.ts`

  **Tests**
  - Add `findChannelByName` mock to `createMockDiscordClient`
  - Fix `notify-owners.test.ts`: type `notifyOn` as `NotificationType[]` (was `string[]`)
  - Fix `archive-thread.test.ts`: use `getAnyChannel` + `isThread()` mock
  - Fix `move-channel.test.ts`: use `createCtx` override instead of post-hoc mutation for cross-category test; update guild.channels.fetch mock to support no-args call
  - Add test: `notify_owners` returns error for nonexistent project
  - Update `query_audit_log` test: unknown `action_type` now returns error (was silent)

- 6581b60: feat: add move_channel and notify_owners tools
  - `move_channel` — reposition a channel or category relative to another channel using `before_id`/`after_id` instead of fragile raw position integers. Resolves sibling positions automatically.
  - `notify_owners` — standalone owner ping tool. Sends `<@mention>`s to a channel based on `notification_type` without a full message or embed. No-ops silently if the type isn't in the project's `notify_owners_on` list. Supports optional message text appended after mentions.

## 0.18.0

### Minor Changes

- 637362e: feat: add move_channel and notify_owners tools
  - `move_channel` — reposition a channel or category relative to another channel using `before_id`/`after_id` instead of fragile raw position integers. Resolves sibling positions automatically.
  - `notify_owners` — standalone owner ping tool. Sends `<@mention>`s to a channel based on `notification_type` without a full message or embed. No-ops silently if the type isn't in the project's `notify_owners_on` list. Supports optional message text appended after mentions.

## 0.17.0

### Minor Changes

- 350cb59: feat: add `run` CLI subcommand and inline JSON support for `DISCORD_OPS_CONFIG`
  - `discord-ops run <tool> --args '<json>'` — execute any tool directly from shell, no AI/MCP required. Supports the full tool suite including `send_template`, `send_message`, `send_embed`, and all 46 tools.
  - `DISCORD_OPS_CONFIG` now accepts an inline JSON string in addition to a file path — if the value starts with `{` it is parsed directly. Eliminates the need to write config files in CI environments.
  - `release.yml` GitHub Actions workflow — automatically posts a rich Discord release notification to `#releases` after every successful npm publish via changesets.
  - README — new CLI `run` docs with examples, CI/CD integration section with config shape, GitHub Actions example, and updated `DISCORD_OPS_CONFIG` env var description.

### Patch Changes

- 350cb59: fix: add "alert" to NotificationType enum — global config with alert in notify_owners_on caused config parse failure and MCP startup crash
- 350cb59: fix: clean up changelog formatting in Discord release notifications — section headers now render as bold text, commit hashes stripped from bullet lines
- 350cb59: Fix stale npx cache — use `discord-ops@latest` in MCP config

  Without `@latest`, npx may serve a cached older version indefinitely, causing MCP clients to run stale code even after new releases are published. All MCP config examples in the README updated to use `discord-ops@latest`.

- 350cb59: fix: release workflow — truncate highlights to Discord 1024-char field limit, auto-sync main back to staging after publish

## 0.16.0

### Minor Changes

- b42d0fe: feat: add `run` CLI subcommand and inline JSON support for `DISCORD_OPS_CONFIG`
  - `discord-ops run <tool> --args '<json>'` — execute any tool directly from shell, no AI/MCP required. Supports the full tool suite including `send_template`, `send_message`, `send_embed`, and all 46 tools.
  - `DISCORD_OPS_CONFIG` now accepts an inline JSON string in addition to a file path — if the value starts with `{` it is parsed directly. Eliminates the need to write config files in CI environments.
  - `release.yml` GitHub Actions workflow — automatically posts a rich Discord release notification to `#releases` after every successful npm publish via changesets.
  - README — new CLI `run` docs with examples, CI/CD integration section with config shape, GitHub Actions example, and updated `DISCORD_OPS_CONFIG` env var description.

### Patch Changes

- b42d0fe: fix: add "alert" to NotificationType enum — global config with alert in notify_owners_on caused config parse failure and MCP startup crash
- b42d0fe: fix: clean up changelog formatting in Discord release notifications — section headers now render as bold text, commit hashes stripped from bullet lines
- b42d0fe: Fix stale npx cache — use `discord-ops@latest` in MCP config

  Without `@latest`, npx may serve a cached older version indefinitely, causing MCP clients to run stale code even after new releases are published. All MCP config examples in the README updated to use `discord-ops@latest`.

## 0.15.0

### Minor Changes

- 01c3e44: feat: add `run` CLI subcommand and inline JSON support for `DISCORD_OPS_CONFIG`
  - `discord-ops run <tool> --args '<json>'` — execute any tool directly from shell, no AI/MCP required. Supports the full tool suite including `send_template`, `send_message`, `send_embed`, and all 46 tools.
  - `DISCORD_OPS_CONFIG` now accepts an inline JSON string in addition to a file path — if the value starts with `{` it is parsed directly. Eliminates the need to write config files in CI environments.
  - `release.yml` GitHub Actions workflow — automatically posts a rich Discord release notification to `#releases` after every successful npm publish via changesets.
  - README — new CLI `run` docs with examples, CI/CD integration section with config shape, GitHub Actions example, and updated `DISCORD_OPS_CONFIG` env var description.

### Patch Changes

- 01c3e44: fix: add "alert" to NotificationType enum — global config with alert in notify_owners_on caused config parse failure and MCP startup crash
- 01c3e44: Fix stale npx cache — use `discord-ops@latest` in MCP config

  Without `@latest`, npx may serve a cached older version indefinitely, causing MCP clients to run stale code even after new releases are published. All MCP config examples in the README updated to use `discord-ops@latest`.

## 0.14.3

### Patch Changes

- 6bd5a54: fix: add "alert" to NotificationType enum — global config with alert in notify_owners_on caused config parse failure and MCP startup crash
- 6bd5a54: Fix stale npx cache — use `discord-ops@latest` in MCP config

  Without `@latest`, npx may serve a cached older version indefinitely, causing MCP clients to run stale code even after new releases are published. All MCP config examples in the README updated to use `discord-ops@latest`.

## 0.14.2

### Patch Changes

- 9fb0d4b: Fix stale npx cache — use `discord-ops@latest` in MCP config

  Without `@latest`, npx may serve a cached older version indefinitely, causing MCP clients to run stale code even after new releases are published. All MCP config examples in the README updated to use `discord-ops@latest`.

## 0.14.1

### Patch Changes

- a17e500: Comprehensive README documentation update
  - Document `send_embed` tool (OG metadata unfurling with field overrides)
  - Document auto-embed behavior for `send_message` and `raw: true` opt-out
  - Document tool profiles (`--profile`, `--tools`, built-in profiles, per-project config)
  - Document owner pings (`owners`, `notify_owners_on`, safety behavior for "dev")
  - Document smart channel resolution (4-layer: alias → fuzzy → Discord API → error)
  - Document HTTP transport authentication (`DISCORD_OPS_HTTP_TOKEN`)
  - Document `edit_channel` support for categories and voice channels, `position` field
  - Document ISO 8601 timestamp support for `get_messages`
  - Add full advanced config reference table with all `~/.discord-ops.json` fields
  - Add `send_embed` to messaging tools table (fixing count to correctly show 46 tools)
  - Add on-call handoff template example
  - Add "Channel not found" troubleshooting entry

## 0.14.0

### Minor Changes

- b4dafe4: Auto-embed for send_message and health endpoint version field
  - **Auto-embed for `send_message`**: Messages are now automatically wrapped in a polished embed (color bar, description, timestamp) via the new `simple` template. Set `raw: true` to send plain text. Every message looks professional by default.
  - **`simple` template**: New minimal utility template — just a branded embed with optional title, color, author, and footer. Used automatically by `send_message`, also available via `send_template`.
  - **Health endpoint `version` field**: `GET /health` now includes the `discord-ops` package version for deployment verification.

- 5cdab50: feat: add position parameter to edit_channel

  `edit_channel` now accepts an optional `position` integer (0-indexed) to reorder channels and categories within a guild. This enables programmatic channel ordering without needing separate Discord admin UI access.

- bdc2994: Live channel name resolution — fuzzy.ts was dead code, now it works
  - **Channel fuzzy resolution**: The `channel` param now resolves in four layers — exact alias match, fuzzy alias match (e.g. `"build"` hits `"builds"`), then a live Discord API lookup that finds channels by their actual Discord name (e.g. `channel: "general"` now works even with no configured alias).
  - **Fuzzy alias matching**: Configured channel aliases are now fuzzy-matched before falling back to Discord, so near-misses on alias names resolve correctly.
  - **`list_templates` fix**: Internal `simple` template (used for auto-embed) no longer appears in `list_templates` output — count now correctly shows 23.

- cdfd27f: feat: project owner pings via notify_owners_on config

  Projects can now declare `owners` (array of Discord user IDs) and `notify_owners_on` (array of notification types) in `~/.discord-ops.json`. When `send_message` or `send_embed` is called with a matching `notification_type`, owner `<@mention>`s are automatically prepended to the message. `notification_type: "dev"` never triggers pings regardless of config.

- 15d91c8: New send_embed tool with server-side OG metadata fetching

### Patch Changes

- cdfd27f: fix: edit_channel now works on categories and voice channels

  Previously, `edit_channel` rejected category and voice channels with "not a text channel". It now uses a guild-aware channel fetch that accepts any channel type, enabling position-based reordering of categories.

- 442e96e: fix: isConnected no longer throws in multi-bot setups

  `DiscordClient.isConnected` was calling `getConnection()` with no token, which throws when no default `DISCORD_TOKEN` is set. Any setup that uses only per-project `token_env` (the standard multi-bot pattern) would immediately crash with "No Discord token available" on the first `health_check` call — before per-project tokens were ever checked. `isConnected` now returns `false` instead of throwing when there is no default token.

- 5cdab50: fix: resolver now includes bot token when channel_id is provided directly

  When `channel_id` was passed directly to `resolveTarget`, the returned `ResolvedTarget` was missing the `token` field even if a `project` was specified. This caused direct-channel-ID calls in multi-bot setups to fall back to the default bot token instead of the project-specific one.

## 0.13.0

### Minor Changes

- 4928e5e: Auto-embed for send_message and health endpoint version field
  - **Auto-embed for `send_message`**: Messages are now automatically wrapped in a polished embed (color bar, description, timestamp) via the new `simple` template. Set `raw: true` to send plain text. Every message looks professional by default.
  - **`simple` template**: New minimal utility template — just a branded embed with optional title, color, author, and footer. Used automatically by `send_message`, also available via `send_template`.
  - **Health endpoint `version` field**: `GET /health` now includes the `discord-ops` package version for deployment verification.

- 4928e5e: feat: add position parameter to edit_channel

  `edit_channel` now accepts an optional `position` integer (0-indexed) to reorder channels and categories within a guild. This enables programmatic channel ordering without needing separate Discord admin UI access.

- 4928e5e: Live channel name resolution — fuzzy.ts was dead code, now it works
  - **Channel fuzzy resolution**: The `channel` param now resolves in four layers — exact alias match, fuzzy alias match (e.g. `"build"` hits `"builds"`), then a live Discord API lookup that finds channels by their actual Discord name (e.g. `channel: "general"` now works even with no configured alias).
  - **Fuzzy alias matching**: Configured channel aliases are now fuzzy-matched before falling back to Discord, so near-misses on alias names resolve correctly.
  - **`list_templates` fix**: Internal `simple` template (used for auto-embed) no longer appears in `list_templates` output — count now correctly shows 23.

- 4928e5e: New send_embed tool with server-side OG metadata fetching

### Patch Changes

- 4928e5e: fix: isConnected no longer throws in multi-bot setups

  `DiscordClient.isConnected` was calling `getConnection()` with no token, which throws when no default `DISCORD_TOKEN` is set. Any setup that uses only per-project `token_env` (the standard multi-bot pattern) would immediately crash with "No Discord token available" on the first `health_check` call — before per-project tokens were ever checked. `isConnected` now returns `false` instead of throwing when there is no default token.

- 4928e5e: fix: resolver now includes bot token when channel_id is provided directly

  When `channel_id` was passed directly to `resolveTarget`, the returned `ResolvedTarget` was missing the `token` field even if a `project` was specified. This caused direct-channel-ID calls in multi-bot setups to fall back to the default bot token instead of the project-specific one.

## 0.12.0

### Minor Changes

- e70b6ac: Auto-embed for send_message and health endpoint version field
  - **Auto-embed for `send_message`**: Messages are now automatically wrapped in a polished embed (color bar, description, timestamp) via the new `simple` template. Set `raw: true` to send plain text. Every message looks professional by default.
  - **`simple` template**: New minimal utility template — just a branded embed with optional title, color, author, and footer. Used automatically by `send_message`, also available via `send_template`.
  - **Health endpoint `version` field**: `GET /health` now includes the `discord-ops` package version for deployment verification.

- e70b6ac: Live channel name resolution — fuzzy.ts was dead code, now it works
  - **Channel fuzzy resolution**: The `channel` param now resolves in four layers — exact alias match, fuzzy alias match (e.g. `"build"` hits `"builds"`), then a live Discord API lookup that finds channels by their actual Discord name (e.g. `channel: "general"` now works even with no configured alias).
  - **Fuzzy alias matching**: Configured channel aliases are now fuzzy-matched before falling back to Discord, so near-misses on alias names resolve correctly.
  - **`list_templates` fix**: Internal `simple` template (used for auto-embed) no longer appears in `list_templates` output — count now correctly shows 23.

- e70b6ac: New send_embed tool with server-side OG metadata fetching

## 0.11.0

### Minor Changes

- c53ebcd: Auto-embed for send_message and health endpoint version field
  - **Auto-embed for `send_message`**: Messages are now automatically wrapped in a polished embed (color bar, description, timestamp) via the new `simple` template. Set `raw: true` to send plain text. Every message looks professional by default.
  - **`simple` template**: New minimal utility template — just a branded embed with optional title, color, author, and footer. Used automatically by `send_message`, also available via `send_template`.
  - **Health endpoint `version` field**: `GET /health` now includes the `discord-ops` package version for deployment verification.

- c53ebcd: Live channel name resolution — fuzzy.ts was dead code, now it works
  - **Channel fuzzy resolution**: The `channel` param now resolves in four layers — exact alias match, fuzzy alias match (e.g. `"build"` hits `"builds"`), then a live Discord API lookup that finds channels by their actual Discord name (e.g. `channel: "general"` now works even with no configured alias).
  - **Fuzzy alias matching**: Configured channel aliases are now fuzzy-matched before falling back to Discord, so near-misses on alias names resolve correctly.
  - **`list_templates` fix**: Internal `simple` template (used for auto-embed) no longer appears in `list_templates` output — count now correctly shows 23.

## 0.10.0

### Minor Changes

- 6c4ef2a: Auto-embed for send_message and health endpoint version field
  - **Auto-embed for `send_message`**: Messages are now automatically wrapped in a polished embed (color bar, description, timestamp) via the new `simple` template. Set `raw: true` to send plain text. Every message looks professional by default.
  - **`simple` template**: New minimal utility template — just a branded embed with optional title, color, author, and footer. Used automatically by `send_message`, also available via `send_template`.
  - **Health endpoint `version` field**: `GET /health` now includes the `discord-ops` package version for deployment verification.

## 0.9.0

### Minor Changes

- dc744af: Slim mode, enhanced health endpoint, and ISO 8601 timestamp support
  - **Tool profiles (`--profile`, `--tools`)**: Load only the tools an agent needs. Four built-in profiles — `monitoring` (6 tools), `readonly` (6), `moderation` (7), `full` (all 45) — slash schema overhead by 85%. Also supports `--tools "t1,t2"` for explicit tool selection. Profile can be set via CLI flags, per-project config, or global config.
  - **Customizable profiles (`tool_profile_add`, `tool_profile_remove`)**: Projects can extend or restrict any base profile via config. Add tools a profile doesn't include, or remove ones you don't need — without defining a fully custom tool list.
  - **Enhanced `/health` endpoint**: Returns uptime, tool profile name, tool count, session count, and rate limiter stats (used/limit/windowMs for both standard and destructive buckets). Designed for Docker healthchecks and monitoring dashboards.
  - **ISO 8601 timestamp support for `get_messages`**: The `before` and `after` parameters now accept ISO 8601 timestamps (e.g. `2025-01-01T00:00:00Z`) in addition to Discord snowflake IDs. Timestamps are automatically converted to snowflakes for reliable time-based message polling.

## 0.8.0

### Minor Changes

- 9979177: Security hardening across the entire codebase
  - **HTTP transport authentication**: Bearer token auth via `DISCORD_OPS_HTTP_TOKEN` env var with constant-time comparison. Warns loudly when running unauthenticated. Health endpoint exempt for load balancer probes.
  - **Snowflake ID validation**: All 17 tool files now use the shared `snowflakeId` regex validator (`/^\d{17,20}$/`) for channel_id, guild_id, user_id, message_id, reply_to, before, after, and parent_id parameters. Defense-in-depth against malformed input.
  - **Permission pre-flight coverage**: Added `requiresGuild: true` to execute_webhook, edit_webhook, and delete_webhook so bot permission checks actually fire before calling the Discord API.
  - **Config file permissions**: Setup wizard now writes `~/.discord-ops.json` with mode 0600 (owner-only) instead of world-readable 0644.
  - **Test fixture sanitization**: Replaced real guild snowflake ID with synthetic `900000000000000001` in test fixtures — no real infrastructure IDs in the public repo.
  - **Dependency update**: discord.js 14.25.1 → 14.26.0, resolving multiple undici vulnerabilities (HTTP smuggling, unbounded decompression, WebSocket overflow).
  - **Token format validation**: Setup wizard validates Discord bot token format (three dot-separated segments) before attempting connection.
  - **Type safety**: Replaced `any` types with proper discord.js types (MessageReaction, Webhook, WebhookCollection).

## 0.7.1

### Patch Changes

- 2a752af: Type safety and setup validation improvements
  - **Tightened TypeScript types**: replaced `any` with proper discord.js types (`MessageReaction`, `Webhook`, `WebhookCollection`) in get-messages and list-webhooks tools
  - **Token format validation**: setup wizard now validates Discord bot token format (three dot-separated segments) in addition to length check, catching bad tokens before the 10s connection timeout

## 0.7.0

### Minor Changes

- c24d139: Cutting-edge template system upgrade — 23 templates with native Discord features
  - **6 new templates**: dashboard (multi-embed status board), progress (visual bar), oncall (shift handoff), standup (daily summary), retro (sprint retrospective), alert (configurable levels)
  - **Native Discord polls**: `poll` template now uses Discord's poll API with progress bars, vote tracking, multiselect, and duration (replaces emoji-based fallback)
  - **Link buttons**: deploy (View Deployment + View Logs), incident (Status Page), review (Open PR), release (Release Notes + npm + Docs), oncall (Runbook), and more
  - **Author branding**: every template supports `author_name` + `author_icon` for consistent identity at the top of embeds
  - **Discord timestamps**: maintenance start/end, incident started_at, announcement deadlines, welcome start_date — all auto-convert to user's timezone with live countdowns
  - **Footer status icons**: deploy, ci_build, incident, status_update show green/red indicator icons
  - **Clickable titles**: release, deploy, review, changelog titles link directly to URLs
  - **Multi-embed dashboards**: up to 10 embeds per message for service status boards
  - **Syntax-highlighted code**: tip template supports `language` var for code block highlighting
  - **Visual progress bars**: Unicode block progress indicator with percentage
  - **Severity-based colors**: incident template colors vary by severity (critical/high/medium/low)
  - **Webhook schema fix**: `execute_webhook` now supports thumbnail, image, author, footer.icon_url (was missing)
  - **Changelog expansion**: deprecated and performance sections added
  - 45 new template tests (255 total)

## 0.6.0

### Minor Changes

- 5a05546: Message template system with 17 built-in Discord embed templates
  - `send_template` tool — send styled embeds using project routing (45 tools total)
  - `list_templates` tool — discover templates with required/optional variables
  - DevOps templates: release, deploy, ci_build, incident, incident_resolved, maintenance, status_update, review
  - Team templates: celebration, welcome, shoutout, quote, announcement, changelog, milestone, tip, poll
  - Curated color palette (success green, error red, celebration pink, premium gold, etc.)
  - All templates support project routing, notification routing, and direct channel targeting
  - 25 new template tests (235 total)

## 0.5.0

### Minor Changes

- cd129a4: Multi-organization hardening release
  - Dynamic version from package.json (server + CLI no longer hardcode version strings)
  - `discord-ops validate` command — checks config without connecting to Discord (duplicate guilds, missing tokens, invalid refs)
  - `list_projects` tool (43 total) — exposes project routing, token status, and validation to AI agents
  - Health check hardened — per-guild try-catch, per-project token status reporting, config validation on startup
  - Setup wizard multi-bot support — prompts for per-project `token_env` when configuring multiple guilds
  - Improved error messages — token resolution failures now include project name, token_env name, and actionable hints
  - 25 new tests — config validation (13), token resolution (8), list_projects tool (4)
  - README: troubleshooting section, migration guide, validate command docs

## 0.4.0

### Minor Changes

- e335fdf: Flexible token configuration for multi-org MCP setups
  - `DISCORD_OPS_TOKEN_ENV` meta-variable lets you point the default token at any env var (not just `DISCORD_TOKEN`)
  - Default token is now optional when all projects specify `token_env` — enables multi-org setups where each project uses its own bot
  - Improved error messages when token resolution fails
  - Updated README with multi-org setup examples and token resolution documentation

## 0.3.0

### Minor Changes

- 6e421f2: Add 8 new tools (pin/unpin message, search messages, archive thread, set channel permissions, get/create invites), HTTP/SSE transport, dry-run mode for destructive operations, and interactive CLI setup wizard.

## 0.2.0

### Minor Changes

- 17 new tools: moderation (kick, ban, unban, timeout), role CRUD + assign, webhook CRUD + execute, audit log query, channel moderation (purge, slowmode, edit, delete)
- Security hardening: rate limiting, permission pre-flight checks, snowflake validation, self-protection guards, error sanitization
- Local CI infrastructure (act-ci.sh + act-ci.yml)

## 0.1.0

### Features

- 18 MCP tools: messaging, channels, guilds, members, roles, threads, health check
- Multi-guild project routing with channel aliases and notification types
- Per-project `.discord-ops.json` config overrides
- Lazy Discord login (tools enumerate before connection)
- Zod input validation on all tools
- Error sanitization (tokens, webhooks, snowflakes stripped)
- Audit logging to stderr
- Fuzzy name resolution (exact, normalized, substring)
- Stdio transport
- Full OSS scaffolding (MIT, CI/CD, changesets, dependabot)

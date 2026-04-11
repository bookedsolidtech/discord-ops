# discord-ops

## 0.23.0

### Minor Changes

- bbc870b: Multi-bot architecture: bot personas, per-channel bot assignment, and per-project tool profile enforcement.

  **Bot personas:** Named bots with identity metadata (`name`, `role`, `description`) configured in a top-level `bots` section. Each bot references a `token_env` and can have a `default_profile` restricting which tools it can use.

  **Channel-level bot assignment:** Channels accept `{ "id": "...", "bot": "bot-name" }` to override which bot operates in that channel. Token resolution follows: channel bot → project bot → project `token_env` → default token.

  **Per-project tool profile enforcement:** Runtime gate in the MCP server checks per-project `tool_profile` and per-bot `default_profile` on every tool call. Tools not in the effective profile return an error. Supports `profile_add`/`profile_remove` overrides.

  **New tool:** `list_bots` — returns all configured bot personas with project assignments, channel overrides, and connection status. Does not expose token values.

  **Validation:** `discord-ops validate` now checks bot references, profile names, and bot token availability.

  Backwards compatible — existing configs without `bots` work unchanged. Channels accept both plain snowflake strings and `{ id, bot }` objects.

## 0.22.0

### Minor Changes

- a7f7218: Engineering audit remediation: 32 findings fixed across 5 epics.

  **Breaking:** `get_messages` now returns full embed and attachment objects instead of counts. `embeds` changes from `number` to `array`, `attachments` from `number` to `array`. Update consumers checking `embeds > 0` to `embeds.length > 0`.

  **New tools:** `send_template`, `list_templates`, `pin_message`, `unpin_message`, `notify_owners`, `get_invites` (42 → 48 tools).

  **CLI:** `setup`, `run`, `validate` subcommands now wired. Flags `--allow-unauthenticated`, `--profile`, `--tools`, `--dry-run`, `--args` accepted. Version reads from package.json dynamically.

  **Bug fixes:** `list_threads` respects `archived` param. `timeout_member` marked destructive. `resolveTarget` returns `undefined` instead of `""` for missing guild. Permission pre-flight logs errors.

  **Security:** SSRF DNS pinning prevents rebinding. Template URL vars validated. X-Forwarded-For parsed right-to-left. Per-project rate limit buckets. Extended reserved IP blocking. Token hashing for cache keys. IP counter hard cap.

  **Code quality:** Dead code removed. TTLCache max-size eviction. Profile tool name validation at startup. Rate limiter bucket pruning.

## 0.21.2

### Patch Changes

- 58be846: Enforce `snowflakeId` schema on all Snowflake ID parameters (`channel_id`, `guild_id`, `author_id`) in `search_messages` and `send_embed` tools. Previously these used bare `z.string()` which lacked the `^\d{17,20}$` pattern validation, causing callers that pass 19-digit integer IDs to hit type coercion errors.

## 0.21.1

### Patch Changes

- e34f143: Add messaging, channels, and webhooks tool profiles; consolidate duplicate filterTools implementation; improve HTTP transport branch coverage (70.45% → 88.88%)

## 0.21.0

### Minor Changes

- b1d687e: Add `discord-ops init` CLI subcommand for non-interactive scaffolding of per-project `.discord-ops.json` config files. Accepts `--project`, `--guild-id`, `--token-env`, `--channel`, `--force`, and `--default` flags. Runs without a Discord connection.
- b1d687e: Add `max_pages` parameter to `search_messages` (1–5, default 1). When set above 1, the tool paginates through results using the `before` cursor and returns up to `max_pages × 100` messages. Response now includes `has_more: boolean` to indicate further pages exist.
- b1d687e: Add `initial_message` parameter to `create_thread`. When provided, the message is posted into the thread immediately after creation, eliminating the need for a follow-up `send_message` call.

### Patch Changes

- f5441f0: Fix audit log redaction to recurse into arrays of objects. Previously, sensitive keys inside array elements (e.g. embed fields with a `token` or `webhook_url` key) passed through unredacted.
- 774d97b: Restrict CORS `Access-Control-Allow-Origin` from wildcard `*` to `http://localhost` by default. The HTTP transport now accepts an `allowedOrigin` option (and `--allowed-origin` CLI flag) to configure the allowed origin explicitly, preventing arbitrary web pages from fingerprinting the `/health` endpoint or establishing unauthenticated SSE connections.
- 3e7faab: Make `guild_id` optional in `execute_webhook`. The parameter was declared required but never used in the handler body. Callers that omit it no longer receive a validation error, while existing callers that provide it continue to work unchanged.
- b1d687e: Enforce auth token requirement on HTTP serve mode startup. The server now refuses to start without `DISCORD_OPS_HTTP_TOKEN` unless `--allow-unauthenticated` is explicitly passed, preventing accidental unauthenticated exposure of the bot API.
- bcc2627: Add `trustProxy` option to HTTP transport for proxy-aware per-IP rate limiting. When enabled, extracts the real client IP from the leftmost non-private address in `X-Forwarded-For` instead of using `req.socket.remoteAddress`. Defaults to `false` so existing behavior is unchanged.
- eca9978: Add standard security response headers to HTTP transport. All non-OPTIONS responses now include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'`, and `Referrer-Policy: no-referrer`. OPTIONS preflight responses are intentionally excluded.
- 3b82f09: Fix SSRF vulnerability in og-fetch: resolve hostname via DNS before fetching and re-validate the resolved IP against the blocklist to prevent DNS rebinding attacks. Also adds 100.64.0.0/10 (shared address space) and 198.18.0.0/15 (benchmarking) to the blocked ranges.
- c27e2f4: Validate embed image and URL fields against private/reserved IP ranges before passing to Discord API. Caller-supplied `image_url` in `send_embed` and all URL fields in `execute_webhook` embeds (url, image.url, thumbnail.url, author.url, author.icon_url, avatar_url) are now checked with `isPublicHttpUrl()` to prevent SSRF via Discord's CDN proxy.

## 0.20.2

### Patch Changes

- 09596d6: Fix port range validation, rate-limiter stats aggregation, and invite channel consistency
  - **CLI**: `--port` now rejects out-of-range values (negative, zero, >65535) with a clear message; previously only `NaN` and falsy values were caught
  - **RateLimiter.stats()**: returns the max-used bucket instead of the sum across all buckets, making `used/limit` a meaningful per-bucket pressure ratio rather than a misleading aggregate
  - **create_invite**: switched from `getChannel` (text-only) to `getAnyChannel` so voice and stage channels are now supported; aligns with the server-layer permission pre-check which already used `getAnyChannel`
  - **SSRF**: block `0.0.0.0` (unspecified IPv4, routes to localhost on many systems) and `::` (IPv6 unspecified address) in OG metadata fetcher

## 0.20.1

### Patch Changes

- 5f65f23: Security hardening and type safety improvements (v0.20.0 audit follow-up)

  **SSRF protection (og-fetch)**
  - Block HTTP redirect following — `redirect: "manual"` prevents redirects to private IPs
  - Full `127.0.0.0/8` loopback range blocked (was only `127.0.0.1`)
  - IPv4-mapped IPv6 addresses (`::ffff:x.x.x.x`) now blocked, handling both dotted-decimal and hex-normalized URL parser forms
  - OG regex patterns pre-compiled at module load instead of per-call

  **Type safety**
  - All 48 tool definitions migrated to `defineTool<T>()` factory — `handle` input parameters are now strongly typed via `z.infer<TSchema>`
  - Fixed 4 latent type bugs exposed by stricter typing: `notification_type` fields now use `NotificationType` enum; role `color` correctly cast to `ColorResolvable`

  **Config resilience**
  - `loadGlobalConfig()` now throws on corrupt/invalid config files instead of silently returning empty config

  **HTTP transport**
  - `ipCounters` map pruned every 60s to prevent unbounded memory growth from unique IPs

  **Test coverage**
  - New `server-perm-check.test.ts`: 6 tests covering the perm pre-flight block in `server.ts`
  - `TOKEN_ENV` format validation tests (8 cases)
  - Audit redaction assertion fixed — now verifies `[REDACTED]` appears in log output
  - 10 new og-fetch tests: redirect blocking, `127.x.x.x` range, IPv4-mapped IPv6, `::1`

## 0.20.0

### Minor Changes

- 02f55c7: Security hardening and structural cleanup (v0.20.0)

  **Security fixes:**
  - H-1: Add `requiresGuild: true` to `delete_channel`, `edit_channel`, `set_slowmode`, `set_permissions`, `purge_messages`, and `create_invite` — enables permission pre-flight checks for channel-targeting tools
  - H-1: Extend server permission pre-check to resolve guild from `channel_id` (not just `guild_id`) so channel tools also get bot-permission enforcement
  - H-2: Remove session count and rate-limiter state from `/health` endpoint — only public operational metadata now exposed
  - H-3: Add per-IP sliding-window rate limiting to HTTP transport — prevents a single client from exhausting shared MCP tool limits
  - H-4: Resolve `DISCORD_OPS_CONFIG` path with `resolve()` and require `.json` extension — guards against path traversal
  - C-2: Validate `DISCORD_OPS_TOKEN_ENV` format (uppercase letters/digits/underscores) — prevents arbitrary env var exfiltration
  - M-1: `set_permissions` now validates allow/deny flags against `PermissionFlagsBits` at schema level — invalid flag names are rejected before reaching Discord API
  - M-2: `fetchOgMetadata` blocks loopback, link-local (AWS metadata), and RFC-1918 private addresses — SSRF protection
  - M-3: HTTP bearer auth now uses `crypto.timingSafeEqual` on SHA-256 digests — eliminates length oracle timing side-channel
  - M-4: `redactSensitiveParams` is now recursive — nested sensitive fields (e.g. `embed.webhook_url`) are redacted in audit logs
  - M-5: `list_projects` no longer exposes `token_env` names — `token_set: boolean` is sufficient for operators

  **Structural improvements:**
  - Extract shared `CHANNEL_TYPE_MAP` to `src/tools/channels/channel-types.ts` — eliminates duplication between `create_channel` and `list_channels`
  - Split `src/tools/guilds/invites.ts` into `get-invites.ts` and `create-invite.ts` — one tool per file convention
  - Add `defineTool<TSchema>()` generic factory to `src/tools/types.ts` — enables fully typed `handle` functions without `any`
  - Fix `BotConnection.connect()` permanent rejection — clears `this.connecting` on failure so subsequent calls retry instead of receiving stale rejected promise

  **New tests:**
  - `test/security/audit.test.ts` — recursive redaction coverage
  - `test/utils/og-fetch.test.ts` — 11 SSRF-blocking scenarios including localhost, AWS metadata, private ranges, and non-HTTP protocols

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

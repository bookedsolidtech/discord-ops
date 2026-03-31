# discord-ops

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

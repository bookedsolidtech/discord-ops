# discord-ops

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

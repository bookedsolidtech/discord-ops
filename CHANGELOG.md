# discord-ops

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

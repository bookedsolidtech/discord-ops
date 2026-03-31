---
"discord-ops": minor
---

Security hardening across the entire codebase

- **HTTP transport authentication**: Bearer token auth via `DISCORD_OPS_HTTP_TOKEN` env var with constant-time comparison. Warns loudly when running unauthenticated. Health endpoint exempt for load balancer probes.
- **Snowflake ID validation**: All 17 tool files now use the shared `snowflakeId` regex validator (`/^\d{17,20}$/`) for channel_id, guild_id, user_id, message_id, reply_to, before, after, and parent_id parameters. Defense-in-depth against malformed input.
- **Permission pre-flight coverage**: Added `requiresGuild: true` to execute_webhook, edit_webhook, and delete_webhook so bot permission checks actually fire before calling the Discord API.
- **Config file permissions**: Setup wizard now writes `~/.discord-ops.json` with mode 0600 (owner-only) instead of world-readable 0644.
- **Test fixture sanitization**: Replaced real guild snowflake ID with synthetic `900000000000000001` in test fixtures — no real infrastructure IDs in the public repo.
- **Dependency update**: discord.js 14.25.1 → 14.26.0, resolving multiple undici vulnerabilities (HTTP smuggling, unbounded decompression, WebSocket overflow).
- **Token format validation**: Setup wizard validates Discord bot token format (three dot-separated segments) before attempting connection.
- **Type safety**: Replaced `any` types with proper discord.js types (MessageReaction, Webhook, WebhookCollection).

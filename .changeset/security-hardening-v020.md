---
"discord-ops": minor
---

Security hardening and structural cleanup (v0.20.0)

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

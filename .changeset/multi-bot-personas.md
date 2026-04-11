---
"discord-ops": minor
---

Multi-bot architecture: bot personas, per-channel bot assignment, and per-project tool profile enforcement.

**Bot personas:** Named bots with identity metadata (`name`, `role`, `description`) configured in a top-level `bots` section. Each bot references a `token_env` and can have a `default_profile` restricting which tools it can use.

**Channel-level bot assignment:** Channels accept `{ "id": "...", "bot": "bot-name" }` to override which bot operates in that channel. Token resolution follows: channel bot → project bot → project `token_env` → default token.

**Per-project tool profile enforcement:** Runtime gate in the MCP server checks per-project `tool_profile` and per-bot `default_profile` on every tool call. Tools not in the effective profile return an error. Supports `profile_add`/`profile_remove` overrides.

**New tool:** `list_bots` — returns all configured bot personas with project assignments, channel overrides, and connection status. Does not expose token values.

**Validation:** `discord-ops validate` now checks bot references, profile names, and bot token availability.

Backwards compatible — existing configs without `bots` work unchanged. Channels accept both plain snowflake strings and `{ id, bot }` objects.

---
"discord-ops": patch
---

Enforce `snowflakeId` schema on all Snowflake ID parameters (`channel_id`, `guild_id`, `author_id`) in `search_messages` and `send_embed` tools. Previously these used bare `z.string()` which lacked the `^\d{17,20}$` pattern validation, causing callers that pass 19-digit integer IDs to hit type coercion errors.

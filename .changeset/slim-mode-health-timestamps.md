---
"discord-ops": minor
---

Slim mode, enhanced health endpoint, and ISO 8601 timestamp support

- **Tool profiles (`--profile`, `--tools`)**: Load only the tools an agent needs. Four built-in profiles — `monitoring` (6 tools), `readonly` (6), `moderation` (7), `full` (all 45) — slash schema overhead by 85%. Also supports `--tools "t1,t2"` for explicit tool selection. Profile can be set via CLI flags, per-project config, or global config.
- **Customizable profiles (`tool_profile_add`, `tool_profile_remove`)**: Projects can extend or restrict any base profile via config. Add tools a profile doesn't include, or remove ones you don't need — without defining a fully custom tool list.
- **Enhanced `/health` endpoint**: Returns uptime, tool profile name, tool count, session count, and rate limiter stats (used/limit/windowMs for both standard and destructive buckets). Designed for Docker healthchecks and monitoring dashboards.
- **ISO 8601 timestamp support for `get_messages`**: The `before` and `after` parameters now accept ISO 8601 timestamps (e.g. `2025-01-01T00:00:00Z`) in addition to Discord snowflake IDs. Timestamps are automatically converted to snowflakes for reliable time-based message polling.

---
"discord-ops": patch
---

fix: resolver now includes bot token when channel_id is provided directly

When `channel_id` was passed directly to `resolveTarget`, the returned `ResolvedTarget` was missing the `token` field even if a `project` was specified. This caused direct-channel-ID calls in multi-bot setups to fall back to the default bot token instead of the project-specific one.

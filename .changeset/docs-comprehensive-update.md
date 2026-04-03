---
"discord-ops": patch
---

Comprehensive README documentation update

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

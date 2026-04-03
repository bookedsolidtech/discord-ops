---
"discord-ops": minor
---

Live channel name resolution — fuzzy.ts was dead code, now it works

- **Channel fuzzy resolution**: The `channel` param now resolves in four layers — exact alias match, fuzzy alias match (e.g. `"build"` hits `"builds"`), then a live Discord API lookup that finds channels by their actual Discord name (e.g. `channel: "general"` now works even with no configured alias).
- **Fuzzy alias matching**: Configured channel aliases are now fuzzy-matched before falling back to Discord, so near-misses on alias names resolve correctly.
- **`list_templates` fix**: Internal `simple` template (used for auto-embed) no longer appears in `list_templates` output — count now correctly shows 23.

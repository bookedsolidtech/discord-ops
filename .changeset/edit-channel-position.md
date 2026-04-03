---
"discord-ops": minor
---

feat: add position parameter to edit_channel

`edit_channel` now accepts an optional `position` integer (0-indexed) to reorder channels and categories within a guild. This enables programmatic channel ordering without needing separate Discord admin UI access.

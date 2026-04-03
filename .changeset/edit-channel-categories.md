---
"discord-ops": patch
---

fix: edit_channel now works on categories and voice channels

Previously, `edit_channel` rejected category and voice channels with "not a text channel". It now uses a guild-aware channel fetch that accepts any channel type, enabling position-based reordering of categories.

---
"discord-ops": minor
---

Add `max_pages` parameter to `search_messages` (1–5, default 1). When set above 1, the tool paginates through results using the `before` cursor and returns up to `max_pages × 100` messages. Response now includes `has_more: boolean` to indicate further pages exist.

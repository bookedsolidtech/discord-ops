---
"discord-ops": minor
---

feat: add move_channel and notify_owners tools

- `move_channel` — reposition a channel or category relative to another channel using `before_id`/`after_id` instead of fragile raw position integers. Resolves sibling positions automatically.
- `notify_owners` — standalone owner ping tool. Sends `<@mention>`s to a channel based on `notification_type` without a full message or embed. No-ops silently if the type isn't in the project's `notify_owners_on` list. Supports optional message text appended after mentions.

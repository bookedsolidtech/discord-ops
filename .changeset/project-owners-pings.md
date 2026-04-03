---
"discord-ops": minor
---

feat: project owner pings via notify_owners_on config

Projects can now declare `owners` (array of Discord user IDs) and `notify_owners_on` (array of notification types) in `~/.discord-ops.json`. When `send_message` or `send_embed` is called with a matching `notification_type`, owner `<@mention>`s are automatically prepended to the message. `notification_type: "dev"` never triggers pings regardless of config.

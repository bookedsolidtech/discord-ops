---
"discord-ops": minor
---

Add read-side primitives for bi-directional agent-to-agent communication over Discord.

- `get_message` — fetch a single message by ID with reply linkage (`reply_to`), pin state, edit timestamp, thread info (`has_thread`/`thread_id`), and the author's bot flag, so an agent can re-check a message it posted earlier.
- `get_reactions` — read who reacted to a message and with what emoji (with per-user bot flags), so an agent can detect acks, claims, and blocks left by humans or peer agents. Supports an emoji filter and a per-emoji user limit.
- `get_replies` — collect direct replies to a message by scanning messages posted after it, with `scanned`/`last_scanned_id` pagination fields and an `after` resume cursor.
- `get_messages` now includes `reply_to` on every returned message so reply chains are visible in bulk reads.
- `send_message` now returns `message_id` (alongside the existing `id`) so agents can capture it and poll for responses later.
- The new read tools are included in the `monitoring`, `readonly`, and `messaging` tool profiles.

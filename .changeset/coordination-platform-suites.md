---
"discord-ops": minor
---

Coordination platform expansion: four new tool suites (15 tools, 67 total).

- **Personas** — one bot, unlimited posting identities via per-message webhook
  overrides: `create_persona`, `send_as`, `list_personas`. No new bot
  applications, no developer-portal work; webhook tokens never appear in
  results.
- **Polls** — native Discord polls as structured consensus: `send_poll`,
  `get_poll_results` (per-answer voter lists with bot flags and pagination),
  `end_poll` (idempotent, destructive-flagged).
- **Workflow** — `forward_message` (immutable cross-channel snapshots for
  escalation) and forum channels as agent work queues: `create_forum_post`,
  `list_forum_posts`, `update_forum_post` (tags by name as status labels,
  archive to close).
- **Botops** — bot self-management without the developer portal:
  `set_bot_nick`, `update_application` (description, SSRF-guarded icon
  upload, tags, install params), and application emoji CRUD returning
  `add_reaction`-ready identifiers.
- Profiles: `monitoring` gains `send_as`/`send_poll`/`get_poll_results`;
  `readonly` gains the new read tools; `messaging` gains
  `send_as`/`forward_message`.

---
"discord-ops": minor
---

Project note board — directed, durable note-passing across concurrent sessions.

- **`leave_note`** posts a directed note to a project's shared board channel,
  addressed to a session id, a role/name, or `all`, with tags for filtering.
- **`get_notes`** reads the board with recipient/sender/tag/unresolved filters
  and an `after` cursor — the first call an agent makes on startup to pick up
  hand-offs and see what other sessions have done.
- **`resolve_note`** marks a note handled (✅) with an optional reply, so open
  hand-offs drop off the unresolved list.
- **`list_sessions`** reports which sessions are active on a project (derived
  from note activity), so concurrent sessions on the same codebase can
  coordinate instead of colliding.
- New `board_channel` project config field selects the board, with a fallback
  chain (`board`/`agent-board` alias → `agent-logs` → `backchannel` →
  `default_channel`). Session identity comes from `DISCORD_OPS_SESSION` or an
  auto-derived id. The note tools are included in the `monitoring` profile.
- New `docs/project-onboarding.md` walks a project through adopting the full
  system.

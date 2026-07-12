---
"discord-ops": minor
---

Real-time event sidecar and security hardening for the coordination suites.

- **Gateway sidecar** — `discord-ops listen` opens a gateway connection per bot
  token and streams `message_create`/`reaction_add` events to a local JSONL
  sink; the new `get_events` tool reads that sink with a `last_seq` cursor
  (mirroring `get_replies`) and zero Discord API calls per poll, reporting
  `sink_active` so agents fall back to `get_messages` when the sidecar is down.
  The sink is created `0600` (dir `0700`), refuses symlinked or traversal
  paths, and writes one `JSON.stringify` object per line.
- **Botops** — `interactions_endpoint_url` is removed from `update_application`
  (a control-plane field an agent must never be able to redirect); the tool now
  documents that its edits are application-global.
- **Personas** — reserved authority names (`system`, `admin`, `moderator`,
  `owner`, …) are blocked, with zero-width/obfuscation normalization, to blunt
  impersonation.
- **Sanitizer** — the webhook-URL redaction now covers `discordapp.com`,
  canary/ptb subdomains, and version-prefixed API paths, and returned (not just
  thrown) error results are sanitized before they reach the audit log.

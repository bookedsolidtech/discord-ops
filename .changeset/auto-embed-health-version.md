---
"discord-ops": minor
---

Auto-embed for send_message and health endpoint version field

- **Auto-embed for `send_message`**: Messages are now automatically wrapped in a polished embed (color bar, description, timestamp) via the new `simple` template. Set `raw: true` to send plain text. Every message looks professional by default.
- **`simple` template**: New minimal utility template — just a branded embed with optional title, color, author, and footer. Used automatically by `send_message`, also available via `send_template`.
- **Health endpoint `version` field**: `GET /health` now includes the `discord-ops` package version for deployment verification.

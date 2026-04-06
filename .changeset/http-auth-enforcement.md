---
"discord-ops": patch
---

Enforce auth token requirement on HTTP serve mode startup. The server now refuses to start without `DISCORD_OPS_HTTP_TOKEN` unless `--allow-unauthenticated` is explicitly passed, preventing accidental unauthenticated exposure of the bot API.

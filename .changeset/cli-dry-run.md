---
"discord-ops": minor
---

Dry-run now works everywhere it is documented. `discord-ops run` ignored `DRY_RUN`, `DISCORD_OPS_DRY_RUN` and `--dry-run`, so a rehearsed destructive call really ran, and the MCP server ignored `--dry-run`. `discord-ops run` also applies each project's tool profile, as the MCP server does.

---
"discord-ops": minor
---

Flexible token configuration for multi-org MCP setups

- `DISCORD_OPS_TOKEN_ENV` meta-variable lets you point the default token at any env var (not just `DISCORD_TOKEN`)
- Default token is now optional when all projects specify `token_env` — enables multi-org setups where each project uses its own bot
- Improved error messages when token resolution fails
- Updated README with multi-org setup examples and token resolution documentation

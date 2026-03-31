---
"discord-ops": minor
---

Multi-organization hardening release

- Dynamic version from package.json (server + CLI no longer hardcode version strings)
- `discord-ops validate` command — checks config without connecting to Discord (duplicate guilds, missing tokens, invalid refs)
- `list_projects` tool (43 total) — exposes project routing, token status, and validation to AI agents
- Health check hardened — per-guild try-catch, per-project token status reporting, config validation on startup
- Setup wizard multi-bot support — prompts for per-project `token_env` when configuring multiple guilds
- Improved error messages — token resolution failures now include project name, token_env name, and actionable hints
- 25 new tests — config validation (13), token resolution (8), list_projects tool (4)
- README: troubleshooting section, migration guide, validate command docs

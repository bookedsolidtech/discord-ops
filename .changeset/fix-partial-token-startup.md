---
"discord-ops": patch
---

Fix validateConfig() treating missing token_env as fatal error in multi-org setups

When a global ~/.discord-ops.json contains projects from multiple organizations, the server
previously failed to start if any project had a missing token_env — even if that project
belonged to a completely different org irrelevant to the current context.

`loadConfig()` now warns about unavailable projects and starts successfully as long as at
least one project has a valid token. Only if all projects lack tokens does startup fail.

`validateConfig()` likewise downgrades per-project missing token_env from errors to warnings,
since the server can still serve other projects.

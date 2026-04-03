---
"discord-ops": patch
---

Fix stale npx cache — use `discord-ops@latest` in MCP config

Without `@latest`, npx may serve a cached older version indefinitely, causing MCP clients to run stale code even after new releases are published. All MCP config examples in the README updated to use `discord-ops@latest`.

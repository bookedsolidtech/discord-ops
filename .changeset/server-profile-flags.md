---
"discord-ops": minor
---

The MCP server honors `--profile` and `--tools`. Both flags were accepted and documented but never passed on, so `--profile readonly` started all tools. An unknown profile or tool name, an empty `--tools` list, a repeated flag, both flags together, or either flag on a subcommand other than `serve` now refuses to start. The README example that combined the two flags is removed.

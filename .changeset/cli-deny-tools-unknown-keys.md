---
"discord-ops": minor
---

`discord-ops run` now applies `deny_tools`, and refuses to run when it names an unsupported tool, as the MCP server does. Config loading refuses a misspelled `deny_tools`, `webhook_senders` or `posts.require_approval` key instead of silently dropping it, and warns about other unknown project keys.

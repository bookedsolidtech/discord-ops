---
"discord-ops": patch
---

Security: dependency refresh so every high/critical `npm audit` finding is cleared and releases pass the publish gate.

- **zod 3 → 4.** Tool input schemas and the JSON Schemas advertised to MCP clients are unchanged: all 72 tools list with the same properties and required fields.
- **Runtime dependencies refreshed** via `npm audit fix`, including `@modelcontextprotocol/sdk`, `discord.js`, and `undici`.
- **Dev tooling:** vitest 3 → 5, plus vite and other transitive updates.

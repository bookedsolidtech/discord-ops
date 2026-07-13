---
"discord-ops": minor
---

`discord-ops setup` now writes `.mcp.json` and configures the coordination board.

- The wizard offers to write (or merge into) a `.mcp.json` in the current
  directory, so Claude Code loads discord-ops for the project with one command
  — no hand-editing. It references the project's token env var by name (never a
  raw token) and preserves any other MCP servers already configured.
- Each project can pick a coordination note-board channel during setup; the
  wizard shows the channel the smart fallback resolves to and only writes an
  explicit `board_channel` when you override it.

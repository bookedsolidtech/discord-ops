---
"discord-ops": minor
---

feat: add `run` CLI subcommand and inline JSON support for `DISCORD_OPS_CONFIG`

- `discord-ops run <tool> --args '<json>'` — execute any tool directly from shell, no AI/MCP required. Supports the full tool suite including `send_template`, `send_message`, `send_embed`, and all 46 tools.
- `DISCORD_OPS_CONFIG` now accepts an inline JSON string in addition to a file path — if the value starts with `{` it is parsed directly. Eliminates the need to write config files in CI environments.
- `release.yml` GitHub Actions workflow — automatically posts a rich Discord release notification to `#releases` after every successful npm publish via changesets.
- README — new CLI `run` docs with examples, CI/CD integration section with config shape, GitHub Actions example, and updated `DISCORD_OPS_CONFIG` env var description.

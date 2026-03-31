# discord-ops

Agency-grade Discord MCP server with multi-guild project routing.

[![CI](https://github.com/bookedsolidtech/discord-ops/actions/workflows/ci.yml/badge.svg)](https://github.com/bookedsolidtech/discord-ops/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/discord-ops)](https://www.npmjs.com/package/discord-ops)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- **35 MCP tools** — messaging, channels, moderation, roles, webhooks, audit log, threads, guilds, health check
- **Multi-guild project routing** — `send_message({ project: "my-app", channel: "builds" })` instead of raw channel IDs
- **Notification routing** — map notification types (ci_build, deploy, error) to channels per project
- **Multi-bot support** — manage multiple Discord bots from a single MCP server
- **Security hardening** — rate limiting, permission pre-flight checks, snowflake ID validation, self-protection guards
- **Lazy login** — tools enumerate before Discord connects; first tool call triggers login
- **Zod validation** — all inputs validated before execution
- **Error sanitization** — tokens, webhook URLs, and snowflake IDs stripped from error output
- **Audit logging** — every tool call logged to stderr
- **Fuzzy name resolution** — find channels/roles/members by name, normalized name, or substring

## Quick Start

```bash
# Install
npm install -g discord-ops

# Set your bot token
export DISCORD_TOKEN="your-bot-token"

# Run health check
discord-ops health

# Start MCP server (stdio)
discord-ops
```

## Claude Code Integration

Add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": ["-y", "discord-ops"],
      "env": {
        "DISCORD_TOKEN": "your-bot-token"
      }
    }
  }
}
```

## Project Routing

The killer feature: route messages by project name and channel alias instead of raw IDs.

### Global config (`~/.discord-ops.json`)

```json
{
  "projects": {
    "my-app": {
      "guild_id": "123456789012345678",
      "channels": {
        "dev": "CHANNEL_ID",
        "builds": "CHANNEL_ID",
        "alerts": "CHANNEL_ID"
      },
      "default_channel": "dev"
    }
  },
  "default_project": "my-app",
  "notification_routing": {
    "ci_build": "builds",
    "error": "alerts",
    "dev": "dev"
  }
}
```

### Per-project config (`.discord-ops.json` in repo root)

```json
{
  "project": "my-app",
  "notification_routing": {
    "ci_build": "builds",
    "deploy": "builds"
  }
}
```

### Usage

```
# By project + channel alias
send_message({ project: "my-app", channel: "builds", content: "Build passed!" })

# By notification type (auto-routed)
send_message({ notification_type: "ci_build", content: "CI green" })

# Direct channel ID (always works)
send_message({ channel_id: "123456789", content: "Hello" })
```

## Tools

### Messaging

| Tool | Description |
| --- | --- |
| `send_message` | Send a message with project routing |
| `get_messages` | Fetch recent messages |
| `edit_message` | Edit a bot message |
| `delete_message` | Delete a message |
| `add_reaction` | React to a message |

### Channels

| Tool | Description |
| --- | --- |
| `list_channels` | List guild channels |
| `get_channel` | Get channel details |
| `create_channel` | Create a channel |
| `edit_channel` | Edit channel properties |
| `delete_channel` | Delete a channel |
| `purge_messages` | Bulk-delete messages (max 100, < 14 days old) |
| `set_slowmode` | Set or disable slowmode |

### Moderation

| Tool | Description |
| --- | --- |
| `kick_member` | Kick a member from a guild |
| `ban_member` | Ban a user from a guild |
| `unban_member` | Unban a user |
| `timeout_member` | Timeout (mute) a member |

### Roles

| Tool | Description |
| --- | --- |
| `list_roles` | List guild roles |
| `create_role` | Create a new role |
| `edit_role` | Edit role properties |
| `delete_role` | Delete a role |
| `assign_role` | Add or remove a role from a member |

### Webhooks

| Tool | Description |
| --- | --- |
| `create_webhook` | Create a webhook on a channel |
| `get_webhook` | Get webhook details |
| `list_webhooks` | List webhooks for a guild or channel |
| `edit_webhook` | Edit webhook properties |
| `delete_webhook` | Delete a webhook |
| `execute_webhook` | Send a message via webhook |

### Audit

| Tool | Description |
| --- | --- |
| `query_audit_log` | Query guild audit log with filters |

### Other

| Tool | Description |
| --- | --- |
| `list_guilds` | List bot's guilds |
| `get_guild` | Get guild details |
| `list_members` | List guild members |
| `get_member` | Get member details |
| `create_thread` | Create a thread |
| `list_threads` | List active threads |
| `health_check` | Bot status + permissions |

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `DISCORD_OPS_CONFIG` | No | Path to global config (default: `~/.discord-ops.json`) |
| `DISCORD_OPS_LOG_LEVEL` | No | `debug`, `info`, `warn`, `error` (default: `info`) |

## Development

```bash
git clone https://github.com/bookedsolidtech/discord-ops.git
cd discord-ops
npm install
npm run build
npm test

# Local CI
./scripts/act-ci.sh --local
```

## License

MIT

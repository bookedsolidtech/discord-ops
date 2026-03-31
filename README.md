# discord-ops

Agency-grade Discord MCP server with multi-guild project routing.

[![CI](https://github.com/bookedsolidtech/discord-ops/actions/workflows/ci.yml/badge.svg)](https://github.com/bookedsolidtech/discord-ops/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/discord-ops)](https://www.npmjs.com/package/discord-ops)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- **42 MCP tools** — messaging, channels, moderation, roles, webhooks, audit log, threads, guilds, invites, permissions, search
- **Multi-guild project routing** — `send_message({ project: "my-app", channel: "builds" })` instead of raw channel IDs
- **Notification routing** — map notification types (ci_build, deploy, error) to channels per project
- **Multi-bot support** — manage multiple Discord bots from a single MCP server
- **HTTP/SSE + stdio transports** — stdio for Claude Code, HTTP/SSE for remote MCP clients
- **Dry-run mode** — simulate destructive operations without calling Discord API
- **Interactive setup wizard** — `discord-ops setup` walks through config creation
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

# Interactive setup (creates ~/.discord-ops.json)
discord-ops setup

# Or manual setup
export DISCORD_TOKEN="your-bot-token"
discord-ops health

# Start MCP server (stdio)
discord-ops

# Start MCP server (HTTP/SSE)
discord-ops serve --port 3000
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

### Messaging (8 tools)

| Tool              | Description                                       |
| ----------------- | ------------------------------------------------- |
| `send_message`    | Send a message with project routing               |
| `get_messages`    | Fetch recent messages                             |
| `edit_message`    | Edit a bot message                                |
| `delete_message`  | Delete a message                                  |
| `add_reaction`    | React to a message                                |
| `pin_message`     | Pin a message in a channel                        |
| `unpin_message`   | Unpin a message                                   |
| `search_messages` | Search messages by content, author, or date range |

### Channels (8 tools)

| Tool              | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `list_channels`   | List guild channels                                   |
| `get_channel`     | Get channel details                                   |
| `create_channel`  | Create a channel                                      |
| `edit_channel`    | Edit channel properties                               |
| `delete_channel`  | Delete a channel                                      |
| `purge_messages`  | Bulk-delete messages (max 100, < 14 days old)         |
| `set_slowmode`    | Set or disable slowmode                               |
| `set_permissions` | Set channel permission overrides for a role or member |

### Moderation (4 tools)

| Tool             | Description                |
| ---------------- | -------------------------- |
| `kick_member`    | Kick a member from a guild |
| `ban_member`     | Ban a user from a guild    |
| `unban_member`   | Unban a user               |
| `timeout_member` | Timeout (mute) a member    |

### Roles (5 tools)

| Tool          | Description                        |
| ------------- | ---------------------------------- |
| `list_roles`  | List guild roles                   |
| `create_role` | Create a new role                  |
| `edit_role`   | Edit role properties               |
| `delete_role` | Delete a role                      |
| `assign_role` | Add or remove a role from a member |

### Webhooks (6 tools)

| Tool              | Description                          |
| ----------------- | ------------------------------------ |
| `create_webhook`  | Create a webhook on a channel        |
| `get_webhook`     | Get webhook details                  |
| `list_webhooks`   | List webhooks for a guild or channel |
| `edit_webhook`    | Edit webhook properties              |
| `delete_webhook`  | Delete a webhook                     |
| `execute_webhook` | Send a message via webhook           |

### Audit (1 tool)

| Tool              | Description                        |
| ----------------- | ---------------------------------- |
| `query_audit_log` | Query guild audit log with filters |

### Guilds & Members (6 tools)

| Tool            | Description                         |
| --------------- | ----------------------------------- |
| `list_guilds`   | List bot's guilds                   |
| `get_guild`     | Get guild details                   |
| `get_invites`   | Get all active invites for a guild  |
| `create_invite` | Create an invite link for a channel |
| `list_members`  | List guild members                  |
| `get_member`    | Get member details                  |

### Threads (3 tools)

| Tool             | Description                            |
| ---------------- | -------------------------------------- |
| `create_thread`  | Create a thread                        |
| `list_threads`   | List active threads                    |
| `archive_thread` | Archive (and optionally lock) a thread |

### System (1 tool)

| Tool           | Description              |
| -------------- | ------------------------ |
| `health_check` | Bot status + permissions |

## CLI

```
discord-ops              Start MCP server (stdio transport)
discord-ops serve        Start MCP server (HTTP/SSE transport)
discord-ops setup        Interactive setup wizard
discord-ops health       Run health check + permission audit
discord-ops --dry-run    Simulate destructive operations
discord-ops --help       Show help
discord-ops --version    Show version
```

## Environment Variables

| Variable                | Required | Description                                            |
| ----------------------- | -------- | ------------------------------------------------------ |
| `DISCORD_TOKEN`         | Yes      | Discord bot token                                      |
| `DISCORD_OPS_CONFIG`    | No       | Path to global config (default: `~/.discord-ops.json`) |
| `DISCORD_OPS_LOG_LEVEL` | No       | `debug`, `info`, `warn`, `error` (default: `info`)     |
| `DISCORD_OPS_DRY_RUN`   | No       | Enable dry-run mode (any truthy value)                 |

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

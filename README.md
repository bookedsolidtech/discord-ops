# discord-ops

Agency-grade Discord MCP server with multi-guild project routing.

[![CI](https://github.com/bookedsolidtech/discord-ops/actions/workflows/ci.yml/badge.svg)](https://github.com/bookedsolidtech/discord-ops/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/discord-ops)](https://www.npmjs.com/package/discord-ops)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- **45 MCP tools** — messaging, channels, moderation, roles, webhooks, audit log, threads, guilds, invites, permissions, search, 23 templates, project introspection
- **Multi-guild project routing** — `send_message({ project: "my-app", channel: "builds" })` instead of raw channel IDs
- **Notification routing** — map notification types (ci_build, deploy, error) to channels per project
- **Multi-bot support** — manage multiple Discord bots from a single MCP server with per-project tokens
- **Flexible token configuration** — configurable default token env var, optional default token when all projects use per-project tokens
- **Config validation** — `discord-ops validate` detects duplicate guilds, missing tokens, invalid channel refs without connecting to Discord
- **HTTP/SSE + stdio transports** — stdio for Claude Code, HTTP/SSE for remote MCP clients
- **Dry-run mode** — simulate destructive operations without calling Discord API
- **Interactive setup wizard** — `discord-ops setup` supports single-bot and multi-bot configuration
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

### Multi-org setup (per-project tokens, no default)

When each project uses its own bot token, you don't need `DISCORD_TOKEN` at all:

```json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": ["-y", "discord-ops"],
      "env": {
        "PROJECT_A_TOKEN": "bot-token-for-project-a",
        "PROJECT_B_TOKEN": "bot-token-for-project-b"
      }
    }
  }
}
```

### Custom default token env var

If another tool already claims `DISCORD_TOKEN`, use `DISCORD_OPS_TOKEN_ENV` to point at a different env var:

```json
{
  "mcpServers": {
    "discord": {
      "command": "npx",
      "args": ["-y", "discord-ops"],
      "env": {
        "DISCORD_OPS_TOKEN_ENV": "MY_DISCORD_BOT_TOKEN",
        "MY_DISCORD_BOT_TOKEN": "your-bot-token"
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

### Per-project bot tokens

Projects can specify their own bot token via `token_env`:

```json
{
  "projects": {
    "org-a": {
      "guild_id": "111111111111111111",
      "channels": { "dev": "CHANNEL_ID" },
      "default_channel": "dev",
      "token_env": "ORG_A_DISCORD_TOKEN"
    },
    "org-b": {
      "guild_id": "222222222222222222",
      "channels": { "dev": "CHANNEL_ID" },
      "default_channel": "dev",
      "token_env": "ORG_B_DISCORD_TOKEN"
    }
  }
}
```

When all projects have `token_env`, the default `DISCORD_TOKEN` is optional. Each project connects with its own bot.

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

### Messaging (10 tools)

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
| `send_template`   | Send a styled embed using a built-in template     |
| `list_templates`  | List available templates with required variables  |

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

### System (2 tools)

| Tool            | Description                                                         |
| --------------- | ------------------------------------------------------------------- |
| `health_check`  | Bot status + permissions                                            |
| `list_projects` | List all projects with guild mappings, token status, and validation |

## CLI

```
discord-ops              Start MCP server (stdio transport)
discord-ops serve        Start MCP server (HTTP/SSE transport)
discord-ops setup        Interactive setup wizard (single + multi-bot)
discord-ops health       Run health check + permission audit
discord-ops validate     Validate config without connecting to Discord
discord-ops --dry-run    Simulate destructive operations
discord-ops --help       Show help
discord-ops --version    Show version
```

## Environment Variables

| Variable                | Required | Description                                                                 |
| ----------------------- | -------- | --------------------------------------------------------------------------- |
| `DISCORD_TOKEN`         | No\*     | Default Discord bot token (\*required unless all projects have `token_env`) |
| `DISCORD_OPS_TOKEN_ENV` | No       | Override which env var holds the default token (default: `DISCORD_TOKEN`)   |
| `<PROJECT>_TOKEN`       | No       | Per-project bot tokens (configured via `token_env` in project config)       |
| `DISCORD_OPS_CONFIG`    | No       | Path to global config file (default: `~/.discord-ops.json`)                 |
| `DISCORD_OPS_LOG_LEVEL` | No       | `debug`, `info`, `warn`, `error` (default: `info`)                          |
| `DISCORD_OPS_DRY_RUN`   | No       | Enable dry-run mode (any truthy value)                                      |
| `DRY_RUN`               | No       | Enable dry-run mode (any truthy value, alias)                               |

### Token resolution

1. If `DISCORD_OPS_TOKEN_ENV` is set, its value names the env var holding the default token (e.g., `DISCORD_OPS_TOKEN_ENV=MY_BOT_TOKEN` reads `MY_BOT_TOKEN`).
2. Otherwise, the default token comes from `DISCORD_TOKEN`.
3. Per-project tokens override the default: if a project config has `"token_env": "ORG_A_TOKEN"`, that project's bot uses `ORG_A_TOKEN`.
4. If all projects have `token_env` set with valid values, no default token is needed at all.

## Dry-Run Mode

Enable dry-run to simulate destructive operations (delete, ban, kick, etc.) without actually calling the Discord API:

```bash
# Via CLI flag
discord-ops --dry-run

# Via environment variable
DISCORD_OPS_DRY_RUN=1 discord-ops

# Via env alias
DRY_RUN=true discord-ops
```

In dry-run mode, destructive tools return a simulated success response showing what would have happened.

## Message Templates

23 built-in templates with cutting-edge Discord features. Use `send_template` with project routing.

**Features across all templates:**

- **Author branding** — every template has a configurable `author_name` + `author_icon` at the top
- **Link buttons** — clickable buttons below embeds (View Logs, Open PR, Runbook, etc.)
- **Discord timestamps** — dates auto-convert to each user's timezone with live countdowns
- **Native polls** — real Discord polls with progress bars and vote tracking
- **Multi-embed dashboards** — up to 10 embeds per message for service status boards
- **Footer icons** — status indicator icons (green/red) next to footer text
- **Clickable titles** — embed titles link directly to URLs
- **Syntax-highlighted code** — code examples with language-specific highlighting
- **Progress bars** — visual Unicode block progress indicators

### DevOps Templates (10)

| Template            | Description                                    | Key Features                                 |
| ------------------- | ---------------------------------------------- | -------------------------------------------- |
| `release`           | Version release with install + link buttons    | Author, link buttons, clickable title        |
| `deploy`            | Deploy success/failure with logs button        | Footer icon, view/logs buttons               |
| `ci_build`          | CI result with build link button               | Footer icon, clickable title                 |
| `incident`          | Incident alert with severity colors            | Discord timestamps, status page button       |
| `incident_resolved` | Resolution with postmortem button              | Discord timestamps, postmortem link          |
| `maintenance`       | Maintenance with live timezone countdowns      | Discord timestamps, countdown, status button |
| `status_update`     | Service status (operational/degraded/outage)   | Footer icon, dashboard button                |
| `review`            | PR review with diff stats + PR button          | Clickable title, additions/deletions         |
| `dashboard`         | Multi-embed service status board (up to 9 svc) | Multi-embed, per-service color cards         |
| `oncall`            | On-call handoff with shift timestamps          | Discord timestamps, runbook button           |
| `alert`             | Configurable alert (info/warn/error/critical)  | Level-based colors, metric thresholds        |

### Team & Community Templates (12)

| Template       | Description                             | Key Features                                  |
| -------------- | --------------------------------------- | --------------------------------------------- |
| `celebration`  | Celebrate wins with images              | Author, thumbnail, image                      |
| `welcome`      | Welcome members with onboarding buttons | Discord timestamps, handbook/onboarding links |
| `shoutout`     | Recognize work with avatar thumbnail    | Thumbnail, nomination attribution             |
| `quote`        | Block-quoted inspirational text         | Block quote formatting, author avatar         |
| `announcement` | Announcement with deadline countdown    | Discord timestamps, countdown, link button    |
| `changelog`    | Changelog with 7 section types          | Deprecated, performance, security sections    |
| `milestone`    | Milestone with target date countdown    | Discord timestamps, progress tracking         |
| `tip`          | Pro tip with syntax-highlighted code    | Language-specific code blocks, doc button     |
| `poll`         | Native Discord poll with vote tracking  | Native poll API, multiselect, duration        |
| `progress`     | Visual progress bar with deadline       | Unicode progress bar, countdown               |
| `standup`      | Daily standup summary                   | Yesterday/today/blockers sections             |
| `retro`        | Sprint retrospective                    | Went-well/improve/actions, velocity           |

### Example

```
send_template({
  template: "release",
  vars: {
    version: "0.7.0",
    name: "discord-ops",
    notes: "Cutting-edge template system with native Discord features",
    highlights: "23 templates, native polls, link buttons, Discord timestamps",
    npm: "discord-ops@0.7.0",
    link: "https://github.com/bookedsolidtech/discord-ops/releases",
    author_name: "Clarity CI",
    author_icon: "https://example.com/logo.png"
  },
  project: "my-app",
  channel: "releases"
})
```

### Native Discord Poll

```
send_template({
  template: "poll",
  vars: {
    question: "Best language for MCP servers?",
    options: "TypeScript|Rust|Go|Python",
    duration: "48",
    multiselect: "true"
  },
  project: "my-app",
  channel: "dev"
})
```

### Multi-Embed Dashboard

```
send_template({
  template: "dashboard",
  vars: {
    services: "API|Database|CDN|Auth|Queue",
    statuses: "operational|operational|degraded|operational|outage",
    title: "Production Status",
    url: "https://status.example.com"
  },
  project: "my-app",
  channel: "alerts"
})
```

All templates support project routing (`project`, `channel`, `notification_type`, `channel_id`) and author branding (`author_name`, `author_icon`).

## Multi-Organization Troubleshooting

### Validating your config

Run `discord-ops validate` to check your config without connecting to Discord. It detects:

- Missing `token_env` values (env var not set)
- Duplicate guild IDs across projects with different tokens
- `default_channel` referencing a nonexistent alias
- `default_project` pointing to a nonexistent project
- Notification routing to nonexistent channel aliases

### Common issues

**"No token available for project X"**
The project needs a token. Either:

- Set its `token_env` env var (e.g., `export ORG_A_TOKEN=...`)
- Set a default token via `DISCORD_TOKEN`
- Use `DISCORD_OPS_TOKEN_ENV` to point at a custom env var

**Bot can't access a guild**
If a project uses `token_env` for a different bot, that bot must be invited to the project's guild. Run `discord-ops health` to see which guilds each bot can access.

**Migrating from single-bot to multi-bot**

1. Add `token_env` to projects that need their own bot
2. Set the corresponding env vars
3. Run `discord-ops validate` to verify
4. Run `discord-ops health` to test connections

**Token rotation**
Update the env var value and restart the MCP server. No config changes needed — `token_env` reads from the environment at runtime.

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

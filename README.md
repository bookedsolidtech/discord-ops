# discord-ops

Agency-grade Discord MCP server with multi-guild project routing.

[![CI](https://github.com/bookedsolidtech/discord-ops/actions/workflows/ci.yml/badge.svg)](https://github.com/bookedsolidtech/discord-ops/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/discord-ops)](https://www.npmjs.com/package/discord-ops)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Features

- **46 MCP tools** — messaging, channels, moderation, roles, webhooks, audit log, threads, guilds, invites, permissions, search, 23 templates, OG embed unfurling, project introspection
- **Multi-guild project routing** — `send_message({ project: "my-app", channel: "builds" })` instead of raw channel IDs
- **Notification routing** — map notification types (`ci_build`, `deploy`, `error`) to channels per project
- **Owner pings** — configure project owners so releases, errors, and alerts auto-mention the right people
- **Multi-bot support** — manage multiple Discord bots from a single MCP server with per-project tokens
- **Tool profiles** — load only the tools an agent needs; cut schema overhead by 85% with slim profiles
- **Smart channel resolution** — channel params accept channel name or snowflake ID, with 4-layer fuzzy fallback
- **Auto-embed for send_message** — every message gets a branded embed by default; `raw: true` for plain text
- **OG metadata unfurling** — `send_embed` fetches Open Graph metadata server-side and renders rich link previews
- **Flexible token configuration** — configurable default token env var, optional default when all projects use per-project tokens
- **Config validation** — `discord-ops validate` detects duplicate guilds, missing tokens, invalid channel refs without connecting to Discord
- **HTTP/SSE + stdio transports** — stdio for Claude Code, HTTP/SSE for remote MCP clients
- **HTTP transport auth** — bearer token auth via `DISCORD_OPS_HTTP_TOKEN` with constant-time comparison
- **Dry-run mode** — simulate destructive operations without calling Discord API
- **Interactive setup wizard** — `discord-ops setup` supports single-bot and multi-bot configuration
- **Security hardening** — rate limiting, permission pre-flight checks, snowflake ID validation, self-protection guards
- **Lazy login** — tools enumerate before Discord connects; first tool call triggers login
- **Zod validation** — all inputs validated before execution
- **Error sanitization** — tokens, webhook URLs, and snowflake IDs stripped from error output
- **Audit logging** — every tool call logged to stderr

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

Add to your project's `.mcp.json`. Use `npx` with `@latest` so every session automatically uses the latest published release — without it, npx may serve a stale cached version indefinitely:

```json
{
  "mcpServers": {
    "discord-ops": {
      "command": "npx",
      "args": ["-y", "discord-ops@latest"],
      "env": {
        "DISCORD_TOKEN": "${DISCORD_TOKEN}"
      }
    }
  }
}
```

The `${VAR}` syntax is Claude Code's native env var interpolation — it reads the value from your shell environment at startup. Export your bot token in `~/.zshrc` (or `.bashrc`) and it will be available to all projects without hardcoding it in any file.

### Multi-org setup (per-project tokens)

When each project has its own bot, pass all token env vars and let `~/.discord-ops.json` handle which project uses which:

```json
{
  "mcpServers": {
    "discord-ops": {
      "command": "npx",
      "args": ["-y", "discord-ops@latest"],
      "env": {
        "ORG_A_DISCORD_TOKEN": "${ORG_A_DISCORD_TOKEN}",
        "ORG_B_DISCORD_TOKEN": "${ORG_B_DISCORD_TOKEN}"
      }
    }
  }
}
```

Each project in `~/.discord-ops.json` declares `"token_env": "ORG_A_DISCORD_TOKEN"` and discord-ops routes automatically. No default `DISCORD_TOKEN` needed when all projects have `token_env` set.

### Single-org shorthand

If all your projects share one bot, just pass that token:

```json
{
  "mcpServers": {
    "discord-ops": {
      "command": "npx",
      "args": ["-y", "discord-ops@latest"],
      "env": {
        "DISCORD_TOKEN": "${DISCORD_TOKEN}"
      }
    }
  }
}
```

### Custom token env var name

If another tool already claims `DISCORD_TOKEN`, use `DISCORD_OPS_TOKEN_ENV` to point at a different name:

```json
{
  "mcpServers": {
    "discord-ops": {
      "command": "npx",
      "args": ["-y", "discord-ops@latest"],
      "env": {
        "DISCORD_OPS_TOKEN_ENV": "MY_BOT_TOKEN",
        "MY_BOT_TOKEN": "${MY_BOT_TOKEN}"
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
        "alerts": "CHANNEL_ID",
        "releases": "CHANNEL_ID"
      },
      "default_channel": "dev"
    }
  },
  "default_project": "my-app",
  "notification_routing": {
    "ci_build": "builds",
    "deploy": "builds",
    "release": "releases",
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

### Owner pings

Configure project owners so that releases, errors, and alerts automatically prepend `@mentions`. This ensures the right people are always paged for critical events without hardcoding mentions in every message.

```json
{
  "projects": {
    "my-app": {
      "guild_id": "123456789012345678",
      "channels": { "releases": "CHANNEL_ID", "alerts": "CHANNEL_ID" },
      "owners": ["820027414902079548"],
      "notify_owners_on": ["release", "error", "alert"]
    }
  }
}
```

**`notify_owners_on` values:** any notification type (`release`, `error`, `alert`, `ci_build`, `deploy`, etc.)

**Safety:** `"dev"` is hardcoded to never trigger owner pings regardless of config — dev noise stays quiet.

When a `send_message` or `send_embed` call uses a matching `notification_type`, the owner mentions are automatically prepended to the message. No other changes needed.

### Smart channel resolution

The `channel` param accepts a channel name or snowflake ID anywhere a channel is needed. Resolution happens in four layers:

1. **Exact alias match** — `"builds"` hits the `builds` alias in your project config
2. **Fuzzy alias match** — `"build"` or `"blds"` resolves to the closest alias
3. **Live Discord API lookup** — `"general"` resolves even with no configured alias
4. **Error** — if none of the above find a match

This means you can pass `channel: "general"` and it will work even for channels that aren't in your config. You can also pass a raw snowflake ID directly — `channel: "1234567890"` bypasses alias resolution entirely.

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

# By notification type (auto-routed to channel, owner pinged if configured)
send_message({ project: "my-app", notification_type: "release", content: "v1.0.0 shipped" })

# Direct channel ID (always works)
send_message({ channel_id: "123456789", content: "Hello" })

# Channel by name (live lookup — no alias needed)
send_message({ project: "my-app", channel: "general", content: "Hello" })
```

## Messaging

### Auto-embed

`send_message` automatically wraps messages in a polished embed with a color bar, description, and timestamp. Pass `raw: true` to send plain text instead.

```
# Branded embed (default)
send_message({ project: "my-app", channel: "dev", content: "Deploy complete" })

# Plain text
send_message({ project: "my-app", channel: "dev", content: "pong", raw: true })
```

### send_embed — OG metadata unfurling

`send_embed` fetches Open Graph metadata server-side from any URL and renders a rich preview embed. All OG fields can be overridden.

```
send_embed({
  url: "https://www.npmjs.com/package/discord-ops/v/0.14.0",
  project: "my-app",
  channel: "releases",
  title: "discord-ops v0.14.0",
  description: "Owner pings, smart channel resolution, category editing",
  color: 5763719,
  footer: "Released April 3, 2026"
})
```

Useful for sharing GitHub PRs, npm releases, blog posts, or any URL with rich previews — the bot fetches the metadata so Discord's CDN doesn't cache-bust client-side unfurls.

## Tools

### Messaging (11 tools)

| Tool              | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `send_message`    | Send a message with project routing (auto-embed by default) |
| `send_embed`      | Fetch OG metadata from a URL and post a rich embed          |
| `get_messages`    | Fetch recent messages (supports ISO 8601 timestamps)        |
| `edit_message`    | Edit a bot message                                          |
| `delete_message`  | Delete a message                                            |
| `add_reaction`    | React to a message                                          |
| `pin_message`     | Pin a message in a channel                                  |
| `unpin_message`   | Unpin a message                                             |
| `search_messages` | Search messages by content, author, or date range           |
| `send_template`   | Send a styled embed using a built-in template               |
| `list_templates`  | List available templates with required variables            |

### Channels (8 tools)

| Tool              | Description                                                                   |
| ----------------- | ----------------------------------------------------------------------------- |
| `list_channels`   | List guild channels                                                           |
| `get_channel`     | Get channel details                                                           |
| `create_channel`  | Create a channel                                                              |
| `edit_channel`    | Edit channel name, topic, category, or position (text, voice, and categories) |
| `delete_channel`  | Delete a channel                                                              |
| `purge_messages`  | Bulk-delete messages (max 100, < 14 days old)                                 |
| `set_slowmode`    | Set or disable slowmode                                                       |
| `set_permissions` | Set channel permission overrides for a role or member                         |

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
| `health_check`  | Bot status, version, connected guilds, and permission audit         |
| `list_projects` | List all projects with guild mappings, token status, and validation |

## Tool Profiles

Load only the tools an agent needs. Reduces schema token overhead by up to 85% for narrow use cases.

### Built-in profiles

| Profile      | Tools | Description                                                                                        |
| ------------ | ----- | -------------------------------------------------------------------------------------------------- |
| `monitoring` | 6     | health_check, list_guilds, get_guild, get_messages, list_channels, list_members                    |
| `readonly`   | 6     | get_messages, get_channel, get_guild, get_member, list_roles, search_messages                      |
| `moderation` | 7     | kick_member, ban_member, unban_member, timeout_member, purge_messages, get_member, query_audit_log |
| `full`       | 46    | All tools (default)                                                                                |

### Using profiles

```bash
# Via CLI flag
discord-ops --profile monitoring

# Load specific tools
discord-ops --tools "send_message,send_template,health_check"

# Combined (profile as base + add tools)
discord-ops --profile readonly --tools "send_message"
```

### Per-project profile config

Profiles can be set per project in `~/.discord-ops.json` so each agent gets only what it needs:

```json
{
  "projects": {
    "my-app": {
      "guild_id": "123456789012345678",
      "channels": { "dev": "CHANNEL_ID", "alerts": "CHANNEL_ID" },
      "tool_profile": "monitoring",
      "tool_profile_add": ["send_message"],
      "tool_profile_remove": ["list_members"]
    }
  }
}
```

- **`tool_profile`** — base profile to use for this project
- **`tool_profile_add`** — add tools not included in the base profile
- **`tool_profile_remove`** — remove tools from the base profile

## CLI

```
discord-ops                        Start MCP server (stdio transport)
discord-ops serve                  Start MCP server (HTTP/SSE transport)
discord-ops run <tool> --args '{…}' Run any tool directly (no AI/MCP required)
discord-ops setup                  Interactive setup wizard (single + multi-bot)
discord-ops health                 Run health check + permission audit
discord-ops validate               Validate config without connecting to Discord
discord-ops --profile              Load a built-in tool profile (monitoring/readonly/moderation/full)
discord-ops --tools                Load specific tools by name (comma-separated)
discord-ops --dry-run              Simulate destructive operations
discord-ops --help                 Show help
discord-ops --version              Show version
```

### `run` — call any tool without an AI agent

The `run` subcommand executes any discord-ops tool directly from the shell — no MCP client, no AI. Pass all tool input as a single JSON string via `--args`.

```bash
# Send a plain message
npx discord-ops@latest run send_message \
  --args '{"project":"my-app","channel":"general","content":"Deployment complete."}'

# Send a rich release announcement
npx discord-ops@latest run send_template \
  --args '{
    "project": "my-app",
    "channel": "releases",
    "template": "release",
    "vars": {
      "name": "my-app",
      "version": "v1.2.0",
      "author_name": "My Org",
      "highlights": "• New feature A\n• Bug fix B",
      "npm": "my-app@latest",
      "npm_url": "https://www.npmjs.com/package/my-app",
      "link": "https://github.com/my-org/my-app/releases/tag/v1.2.0",
      "footer": "Published 2026-04-03"
    }
  }'
```

Any tool name accepted by the MCP server works here — `send_message`, `send_template`, `send_embed`, `list_channels`, etc. The same input schema applies; validation errors are printed with field paths and exit code 1.

## Environment Variables

| Variable                 | Required | Description                                                                        |
| ------------------------ | -------- | ---------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`          | No\*     | Default Discord bot token (\*required unless all projects have `token_env`)        |
| `DISCORD_OPS_TOKEN_ENV`  | No       | Override which env var holds the default token (default: `DISCORD_TOKEN`)          |
| `<PROJECT>_TOKEN`        | No       | Per-project bot tokens (configured via `token_env` in project config)              |
| `DISCORD_OPS_CONFIG`     | No       | Path to global config file, or inline JSON string (default: `~/.discord-ops.json`) |
| `DISCORD_OPS_LOG_LEVEL`  | No       | `debug`, `info`, `warn`, `error` (default: `info`)                                 |
| `DISCORD_OPS_DRY_RUN`    | No       | Enable dry-run mode (any truthy value)                                             |
| `DRY_RUN`                | No       | Enable dry-run mode (any truthy value, alias)                                      |
| `DISCORD_OPS_HTTP_TOKEN` | No       | Bearer token for HTTP transport authentication (strongly recommended)              |

### Token resolution

1. If `DISCORD_OPS_TOKEN_ENV` is set, its value names the env var holding the default token (e.g., `DISCORD_OPS_TOKEN_ENV=MY_BOT_TOKEN` reads `MY_BOT_TOKEN`).
2. Otherwise, the default token comes from `DISCORD_TOKEN`.
3. Per-project tokens override the default: if a project config has `"token_env": "ORG_A_TOKEN"`, that project's bot uses `ORG_A_TOKEN`.
4. If all projects have `token_env` set with valid values, no default token is needed at all.

## CI/CD Integration

Use `discord-ops run` in GitHub Actions (or any CI) to post rich Discord notifications after a publish, deploy, or build — no AI agent required.

### Config shape for CI

In CI you typically have one bot token and one project. Pass a minimal config as an inline JSON string via `DISCORD_OPS_CONFIG`. No file writing needed.

**When storing as a GitHub secret, minify to a single line** — multiline strings break secret injection. The shape (pretty-printed for readability):

```json
{
  "projects": {
    "my-app": {
      "guild_id": "123456789012345678",
      "channels": {
        "releases": "987654321098765432",
        "builds": "111222333444555666"
      },
      "default_channel": "releases"
    }
  },
  "default_project": "my-app"
}
```

- No `token_env` needed — omitting it means the project uses `DISCORD_TOKEN` (the default).
- `owners` and `notify_owners_on` are optional — include them if you want owner pings on errors.
- Channel values are Discord snowflake IDs. Channel names (aliases) resolve to these IDs.

### GitHub Actions example

Store two secrets in your repo:

- `BOOKED_DISCORD_BOT_TOKEN` — your bot token
- `DISCORD_OPS_CONFIG` — the config JSON **minified to a single line** (multiline strings break GitHub secrets)

```
{"projects":{"my-app":{"guild_id":"123456789012345678","channels":{"releases":"987654321098765432"},"default_channel":"releases"}},"default_project":"my-app"}
```

```yaml
- name: Notify Discord
  run: |
    npx discord-ops@latest run send_template --args '{
      "project": "my-app",
      "channel": "releases",
      "template": "release",
      "vars": {
        "name": "my-app",
        "version": "${{ steps.version.outputs.version }}",
        "author_name": "My Org",
        "highlights": "${{ steps.changelog.outputs.highlights }}",
        "npm": "my-app@latest",
        "npm_url": "https://www.npmjs.com/package/my-app",
        "link": "${{ steps.release.outputs.url }}",
        "footer": "Published ${{ steps.date.outputs.date }}"
      }
    }'
  env:
    DISCORD_TOKEN: ${{ secrets.BOOKED_DISCORD_BOT_TOKEN }}
    DISCORD_OPS_CONFIG: ${{ secrets.DISCORD_OPS_CONFIG }}
```

`DISCORD_TOKEN` is the default token variable — no additional configuration needed. The bot token from your secret is used directly.

## HTTP Transport Security

When running `discord-ops serve`, the HTTP endpoint is unauthenticated by default with a loud startup warning. Set `DISCORD_OPS_HTTP_TOKEN` to require bearer auth:

```bash
DISCORD_OPS_HTTP_TOKEN=your-secret-token discord-ops serve --port 3000
```

All requests must include:

```
Authorization: Bearer your-secret-token
```

The health endpoint (`GET /health`) is always exempt from auth — load balancers and Docker healthchecks can reach it without a token.

Token comparison uses constant-time comparison to prevent timing attacks.

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

### DevOps Templates (11)

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

### Examples

**Release announcement:**

```
send_template({
  template: "release",
  vars: {
    version: "v0.14.0",
    name: "discord-ops",
    highlights: "• Owner pings\n• Smart channel resolution\n• Category channel editing",
    npm: "npm install discord-ops@0.14.0",
    npm_url: "https://www.npmjs.com/package/discord-ops/v/0.14.0",
    link: "https://github.com/bookedsolidtech/discord-ops/pull/20",
    footer: "Released April 3, 2026",
    author_name: "Booked Solid Technology"
  },
  project: "my-app",
  channel: "releases"
})
```

**Native Discord Poll:**

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

**Multi-Embed Status Dashboard:**

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

**On-call handoff:**

```
send_template({
  template: "oncall",
  vars: {
    outgoing: "alice",
    incoming: "bob",
    shift_start: "2026-04-04T09:00:00Z",
    notes: "Payment service latency elevated — watch grafana/d/payments",
    active_incidents: "INC-342: elevated error rate on /checkout",
    runbook_url: "https://wiki.example.com/oncall",
    mention: "<@BOB_USER_ID>"
  },
  project: "my-app",
  channel: "team-chat"
})
```

All templates support project routing (`project`, `channel`, `notification_type`, `channel_id`) and author branding (`author_name`, `author_icon`).

## Advanced Config Reference

Full `~/.discord-ops.json` schema with all options:

```json
{
  "projects": {
    "my-app": {
      "guild_id": "123456789012345678",
      "token_env": "MY_APP_DISCORD_TOKEN",
      "channels": {
        "dev": "CHANNEL_ID",
        "builds": "CHANNEL_ID",
        "releases": "CHANNEL_ID",
        "alerts": "CHANNEL_ID"
      },
      "default_channel": "dev",
      "owners": ["USER_SNOWFLAKE_ID"],
      "notify_owners_on": ["release", "error", "alert"],
      "tool_profile": "full",
      "tool_profile_add": [],
      "tool_profile_remove": [],
      "notification_routing": {
        "ci_build": "builds",
        "deploy": "builds",
        "release": "releases",
        "error": "alerts"
      }
    }
  },
  "default_project": "my-app",
  "notification_routing": {
    "ci_build": "builds",
    "deploy": "builds",
    "release": "releases",
    "error": "alerts",
    "dev": "dev"
  }
}
```

| Field                  | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `guild_id`             | Discord server (guild) snowflake ID                               |
| `token_env`            | Env var name for this project's bot token                         |
| `channels`             | Alias → channel ID map; `channel: "builds"` resolves here first   |
| `default_channel`      | Channel used when no `channel` param is provided                  |
| `owners`               | User snowflake IDs to mention on matching notification types      |
| `notify_owners_on`     | Notification types that trigger owner pings (`"dev"` never pings) |
| `tool_profile`         | Base tool profile for this project (`full`, `monitoring`, etc.)   |
| `tool_profile_add`     | Additional tools to load on top of the base profile               |
| `tool_profile_remove`  | Tools to exclude from the base profile                            |
| `notification_routing` | Per-project override of global notification → channel routing     |

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

**Channel not found**
Channel resolution tries 4 layers in order: exact alias → fuzzy alias → live Discord name lookup → error. If a channel is still not found, verify the bot has access to the channel and `list_channels` returns it.

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

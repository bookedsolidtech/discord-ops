# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in discord-ops, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email security@bookedsolid.tech with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
3. You will receive acknowledgment within 48 hours
4. We will work with you on a fix and coordinated disclosure

## Security Measures

discord-ops implements several security layers:

- **Input validation**: All tool inputs are validated with Zod schemas before execution
- **Token validation**: Bot token format is validated on startup (no API call)
- **Error sanitization**: Discord snowflake IDs, token fragments, and webhook URLs are stripped from error messages
- **Audit logging**: Every tool call is logged to stderr with params, duration, and result
- **Permission checks**: Destructive operations verify bot permissions before execution

## Bot Token Handling

- Tokens are read exclusively from the `DISCORD_TOKEN` environment variable
- Tokens are never logged, cached to disk, or included in error messages
- Token format is validated with regex before any API call

---
"discord-ops": minor
---

Add per-project `deny_tools`: moderation tools refused in that project's guild however the call is routed (project, alias, channel_id or guild_id). Supported: ban_member, kick_member, unban_member, timeout_member, delete_role, delete_channel, purge_messages, delete_message. The server enforces it before the tool runs, fails closed when the guild cannot be determined, and works with the `full` profile. An unsupported name fails server startup.

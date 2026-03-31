---
"discord-ops": patch
---

Type safety and setup validation improvements

- **Tightened TypeScript types**: replaced `any` with proper discord.js types (`MessageReaction`, `Webhook`, `WebhookCollection`) in get-messages and list-webhooks tools
- **Token format validation**: setup wizard now validates Discord bot token format (three dot-separated segments) in addition to length check, catching bad tokens before the 10s connection timeout

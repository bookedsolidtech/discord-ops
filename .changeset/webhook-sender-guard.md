---
"discord-ops": minor
---

delete_webhook and delete_channel check a webhook sender inventory first. A project can set `webhook_senders` (webhook ID → who posts to it, by service and secret name). In that project's guild, deleting a webhook, or a channel that holds one, is refused when the webhook has listed senders or is missing from the inventory, unless the call passes `senders_retired: true`. An empty list records that nothing sends to the webhook. delete_channel also refuses when it cannot list the channel's webhooks. Dry-run reports the same refusals. Projects without `webhook_senders` behave as before.

---
"discord-ops": patch
---

fix: isConnected no longer throws in multi-bot setups

`DiscordClient.isConnected` was calling `getConnection()` with no token, which throws when no default `DISCORD_TOKEN` is set. Any setup that uses only per-project `token_env` (the standard multi-bot pattern) would immediately crash with "No Discord token available" on the first `health_check` call — before per-project tokens were ever checked. `isConnected` now returns `false` instead of throwing when there is no default token.

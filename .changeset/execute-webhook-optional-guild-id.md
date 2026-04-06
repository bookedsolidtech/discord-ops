---
"discord-ops": patch
---

Make `guild_id` optional in `execute_webhook`. The parameter was declared required but never used in the handler body. Callers that omit it no longer receive a validation error, while existing callers that provide it continue to work unchanged.

---
"discord-ops": minor
---

Engineering audit remediation: 32 findings fixed across 5 epics.

**Breaking:** `get_messages` now returns full embed and attachment objects instead of counts. `embeds` changes from `number` to `array`, `attachments` from `number` to `array`. Update consumers checking `embeds > 0` to `embeds.length > 0`.

**New tools:** `send_template`, `list_templates`, `pin_message`, `unpin_message`, `notify_owners`, `get_invites` (42 → 48 tools).

**CLI:** `setup`, `run`, `validate` subcommands now wired. Flags `--allow-unauthenticated`, `--profile`, `--tools`, `--dry-run`, `--args` accepted. Version reads from package.json dynamically.

**Bug fixes:** `list_threads` respects `archived` param. `timeout_member` marked destructive. `resolveTarget` returns `undefined` instead of `""` for missing guild. Permission pre-flight logs errors.

**Security:** SSRF DNS pinning prevents rebinding. Template URL vars validated. X-Forwarded-For parsed right-to-left. Per-project rate limit buckets. Extended reserved IP blocking. Token hashing for cache keys. IP counter hard cap.

**Code quality:** Dead code removed. TTLCache max-size eviction. Profile tool name validation at startup. Rate limiter bucket pruning.

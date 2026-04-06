---
"discord-ops": patch
---

Fix audit log redaction to recurse into arrays of objects. Previously, sensitive keys inside array elements (e.g. embed fields with a `token` or `webhook_url` key) passed through unredacted.

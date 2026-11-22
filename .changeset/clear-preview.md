---
"discord-ops": minor
---

Posting kit: `posts.clear_preview_on_publish` deletes the preview and its header from the preview channel after a successful publish, so the channel holds only previews still awaiting approval. The posts ledger keeps the full record. Cleanup is best effort: a failed delete is reported as `preview_cleanup_error` and never fails the publish.

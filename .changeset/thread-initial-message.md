---
"discord-ops": minor
---

Add `initial_message` parameter to `create_thread`. When provided, the message is posted into the thread immediately after creation, eliminating the need for a follow-up `send_message` call.

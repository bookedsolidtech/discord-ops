---
"discord-ops": patch
---

Validate embed image and URL fields against private/reserved IP ranges before passing to Discord API. Caller-supplied `image_url` in `send_embed` and all URL fields in `execute_webhook` embeds (url, image.url, thumbnail.url, author.url, author.icon_url, avatar_url) are now checked with `isPublicHttpUrl()` to prevent SSRF via Discord's CDN proxy.

---
"discord-ops": patch
---

Add `trustProxy` option to HTTP transport for proxy-aware per-IP rate limiting. When enabled, extracts the real client IP from the leftmost non-private address in `X-Forwarded-For` instead of using `req.socket.remoteAddress`. Defaults to `false` so existing behavior is unchanged.

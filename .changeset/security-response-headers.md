---
"discord-ops": patch
---

Add standard security response headers to HTTP transport. All non-OPTIONS responses now include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: default-src 'none'`, and `Referrer-Policy: no-referrer`. OPTIONS preflight responses are intentionally excluded.

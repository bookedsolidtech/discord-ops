---
"discord-ops": patch
---

Restrict CORS `Access-Control-Allow-Origin` from wildcard `*` to `http://localhost` by default. The HTTP transport now accepts an `allowedOrigin` option (and `--allowed-origin` CLI flag) to configure the allowed origin explicitly, preventing arbitrary web pages from fingerprinting the `/health` endpoint or establishing unauthenticated SSE connections.

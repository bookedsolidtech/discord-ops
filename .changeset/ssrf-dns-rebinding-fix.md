---
"discord-ops": patch
---

Fix SSRF vulnerability in og-fetch: resolve hostname via DNS before fetching and re-validate the resolved IP against the blocklist to prevent DNS rebinding attacks. Also adds 100.64.0.0/10 (shared address space) and 198.18.0.0/15 (benchmarking) to the blocked ranges.

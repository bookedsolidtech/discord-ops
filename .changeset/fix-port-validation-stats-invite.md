---
"discord-ops": patch
---

Fix port range validation, rate-limiter stats aggregation, and invite channel consistency

- **CLI**: `--port` now rejects out-of-range values (negative, zero, >65535) with a clear message; previously only `NaN` and falsy values were caught
- **RateLimiter.stats()**: returns the max-used bucket instead of the sum across all buckets, making `used/limit` a meaningful per-bucket pressure ratio rather than a misleading aggregate
- **create_invite**: switched from `getChannel` (text-only) to `getAnyChannel` so voice and stage channels are now supported; aligns with the server-layer permission pre-check which already used `getAnyChannel`
- **SSRF**: block `0.0.0.0` (unspecified IPv4, routes to localhost on many systems) and `::` (IPv6 unspecified address) in OG metadata fetcher

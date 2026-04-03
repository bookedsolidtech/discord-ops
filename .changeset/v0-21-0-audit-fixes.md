---
"discord-ops": patch
---

Security hardening and type safety improvements (v0.20.0 audit follow-up)

**SSRF protection (og-fetch)**

- Block HTTP redirect following — `redirect: "manual"` prevents redirects to private IPs
- Full `127.0.0.0/8` loopback range blocked (was only `127.0.0.1`)
- IPv4-mapped IPv6 addresses (`::ffff:x.x.x.x`) now blocked, handling both dotted-decimal and hex-normalized URL parser forms
- OG regex patterns pre-compiled at module load instead of per-call

**Type safety**

- All 48 tool definitions migrated to `defineTool<T>()` factory — `handle` input parameters are now strongly typed via `z.infer<TSchema>`
- Fixed 4 latent type bugs exposed by stricter typing: `notification_type` fields now use `NotificationType` enum; role `color` correctly cast to `ColorResolvable`

**Config resilience**

- `loadGlobalConfig()` now throws on corrupt/invalid config files instead of silently returning empty config

**HTTP transport**

- `ipCounters` map pruned every 60s to prevent unbounded memory growth from unique IPs

**Test coverage**

- New `server-perm-check.test.ts`: 6 tests covering the perm pre-flight block in `server.ts`
- `TOKEN_ENV` format validation tests (8 cases)
- Audit redaction assertion fixed — now verifies `[REDACTED]` appears in log output
- 10 new og-fetch tests: redirect blocking, `127.x.x.x` range, IPv4-mapped IPv6, `::1`

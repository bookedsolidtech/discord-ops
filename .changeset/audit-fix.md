---
"discord-ops": patch
---

chore(deps): resolve npm audit findings via audit fix

Updates lockfile to clear 1 high-severity (fast-uri path traversal,
CVSS 7.5) and 7 moderate-severity transitive vulnerabilities in hono,
ip-address, postcss, and ws. No direct dependency changes; no behavioral
impact. Unblocks `prepublishOnly` audit gate for release pipeline.

---
"discord-ops": patch
---

chore: migrate npm publishing to Trusted Publishing (OIDC)

Removes long-lived `NPM_TOKEN` dependency from CI publish workflow.
Authentication now happens via GitHub Actions OIDC token federation,
in response to the npm Mini Shai-Hulud token rotation event. No
behavioral changes for package consumers — sigstore provenance
attestation is preserved.

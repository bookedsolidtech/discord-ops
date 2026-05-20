---
"discord-ops": patch
---

fix(release): pin npm to 11.5.1 for OIDC trusted-publishing auth

The previous corepack-based install activated npm 10.9.7 (corepack's
`npm@latest` alias is stale), which supports `--provenance` for sigstore
attestation but lacks native trusted-publishing OIDC auth. The publish
PUT to the registry therefore went out unauthenticated and was rejected
with a misleading E404. Pinning to npm 11.5.1 ensures both provenance
signing and TP auth function correctly.

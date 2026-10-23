---
"plumix": patch
---

Removes core's dependency on the deprecated `@oslojs/crypto`, `@oslojs/webauthn` and `@oslojs/encoding` packages, so installing Plumix no longer prints their deprecation warnings. Passkeys now verify with the runtime's Web Crypto, and a malformed passkey response is refused as `invalid_response`.

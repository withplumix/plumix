---
"plumix": minor
---

Adds a `passkey` fixture to `plumix/test/playwright`'s `test`: ask for it, as in `async ({ page, passkey })`, and the page signs in and registers with a virtual authenticator, so a passkey journey needs no hardware. `passkey.credentials()` lists what the authenticator holds, for asserting a ceremony stored one.

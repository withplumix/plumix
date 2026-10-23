---
"plumix": patch
---

Fixes two passkey checks. Registration now refuses a public key that is not a point on P-256 as `invalid_response`; such a credential used to register and then fail every sign-in as `credential_storage_corrupt`. Sign-in now refuses a signature counter that drops back to 0 after the authenticator has counted, as `counter_replay`; it used to accept it and reset the stored counter, which switched off clone detection for that passkey.

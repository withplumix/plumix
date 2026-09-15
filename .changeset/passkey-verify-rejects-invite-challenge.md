---
"@plumix/core": patch
---

Fixes `POST /_plumix/auth/passkey/register/verify` accepting a WebAuthn challenge issued by `/_plumix/auth/invite/register/options`. An invite holder could complete enrolment through the passkey route, which minted a session and credential without consuming the invite token, running the invite checks, or firing `user:registered`. Each register-verify route now records which ceremony issued the challenge and refuses the other's with `challenge_mismatch`; the challenge is still consumed. The admin's `challenge_mismatch` message no longer assumes an invite, since the passkey route now returns it too.

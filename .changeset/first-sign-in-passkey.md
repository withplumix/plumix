---
"@plumix/core": patch
---

Fixes `user:signed_in` reporting `firstSignIn: true` when an existing user registers their first passkey. The flag is now true only when the sign-in enrolled the user (a magic-link or OAuth signup, the bootstrap passkey, an accepted invite), so audit logs no longer record a second first sign-in.

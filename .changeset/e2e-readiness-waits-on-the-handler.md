---
"plumix": patch
---

Fixes `definePlumixE2EConfig` starting a `playground` suite before `plumix dev` can answer a server request. Readiness now waits on a request the Plumix handler answers (`/_plumix/auth/magic-link/verify`) instead of the static admin shell, so the first test no longer races Vite's server-side dependency pre-bundle on a cold cache.

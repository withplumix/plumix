---
"@plumix/core": patch
---

Fixes the sync routes accepting an API token narrowed by scopes or a preset. `plumix sync` and `plumix import --url` now need a token with no scopes, minted as "Same as me", and answer `403` for any other.

---
"@plumix/core": patch
"@plumix/admin": patch
---

Fixes OAuth client metadata to accept only `https:` redirect URIs, or `http:` to a loopback host; a document listing any other redirect URI is refused as invalid. The consent page also leaves only for an `http:` or `https:` URL.

---
"plumix": minor
---

Adds the request rules every self-hosted runtime applies to `plumix/runtime`: `trustRequest` decides a request's effective URL and client address from the connection's scheme, port and remote address and the `trustProxy` flag, `resolveAssetPath` decides which file under a static root a URL path names and the headers it is served with, and `DRAIN_DEADLINE_MS` is the shared shutdown deadline. All three use Web APIs only, so they run on any runtime.

---
"@plumix/runtime-node": minor
---

Adds the two pieces a Node process needs in front of the handler. `createRequestListener` bridges `node:http` into a fetch-shaped handler: a streamed request body with the size limit enforced as it streams, an abort signal tied to the client disconnecting, a URL from the socket's scheme and `Host` (with the bound port when `Host` is absent), forwarding headers honoured only under `trustProxy`, multi-value `Set-Cookie` restored on the way out, and a 400 for a path `decodeURI` rejects. `createAssetsLayer` serves the built client directory from disk, both as Connect-style middleware and as the assets binding core reads for admin deep links, refusing traversal, directories and dotfiles, and marking `/assets/` immutable only once the file has opened.

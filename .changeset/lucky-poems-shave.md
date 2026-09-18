---
"plumix": minor
---

Serves `stubPluginRpc` from oRPC's real RPC handler, so a stubbed response matches what a deployed server sends. Blob and file inputs now decode instead of throwing, a responder's unannotated throw reaches the client as a genuine `INTERNAL_SERVER_ERROR` envelope, a non-POST request answers 405, and a fetch the stub does not serve throws naming the URL and the prefix rather than answering a silent 404. Adds `notFoundResponse` to the public surface.

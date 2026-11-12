---
"plumix": patch
---

Fixes `plumix dev`'s `/@plumix-*` dev endpoints to answer only requests from the dev server's own origin, and POSTs only with a JSON body. Control characters in a forwarded browser error's stack frames no longer reach the terminal.

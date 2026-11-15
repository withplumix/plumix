---
"plumix": patch
---

Fixes an island losing a prop, or an object field inside one, whose key is `__proto__`: the server rendered with it and the island hydrated without it. It now arrives as an ordinary key.

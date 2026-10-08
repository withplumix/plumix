---
"@plumix/core": patch
---

Fixes React's "Attempted to synchronously unmount a root while React was already rendering" warning when a parent island's render removes a hydrated nested island. The nested island now unmounts once the parent's render has committed.

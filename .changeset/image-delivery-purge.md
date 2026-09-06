---
"plumix": minor
---

`ImageDelivery` gains an optional `purge(sourceUrl)` for a slot that keeps rendered variants itself, so a plugin can have a source's variants forgotten when the source stops being what it was. A slot that transforms at the edge leaves it out.

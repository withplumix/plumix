---
"@plumix/core": minor
---

Adds `.default()`, `.sanitize()` and `.validate()` to the `group()` and `repeater()` field builders, and `.countGt()` / `.countLt()` to multi-value reference fields and repeaters. A composite's own callbacks run after its sub-fields are settled, over the value that will be stored, so a cross-row uniqueness rule or a cross-member check no longer needs a hand-written field object. Declares the builder capability matrix in one place, bound to the builder types by a typecheck guard, so a chain that is missing a capability its row claims fails `pnpm typecheck`.

Behaviour change: a repeater emptied to zero rows now deletes its meta key instead of storing an empty array, matching how an all-blank group has always behaved. Its `.min()` / `.max()` / `.required()` bounds still run first, so an emptied repeater that violates them is still rejected. The admin renders a deleted key and a stored empty array identically, unless the repeater declares a `.default()` — a stored empty array used to suppress the default, whereas an absent key falls through to it, so clearing such a field now reseeds its default rows on the next load. Direct RPC and REST callers reading the bag back will see the key absent.

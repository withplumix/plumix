---
"plumix": patch
"@plumix/blocks": patch
---

Fix `IslandPropSerializationError: Cyclic reference` when a `"use client"` island
renders a shared client primitive such as a Radix/shadcn context component (e.g.
`Tabs`).

Island props are now serialized exactly once, at the outermost boundary. A
`"use client"` component becomes an island when it carries an explicit hydration
directive (`client=…`) or is the outermost such component in the render; a
non-directive `"use client"` component rendered inside an island now renders
inline (bundled into the parent island) instead of becoming its own island and
re-serializing props. This stops the serializer from walking the cyclic React
Context objects that libraries like Radix thread through their internals.

Components passed into an island as `children`/slots still become their own
island and hydrate independently, and intentional nested islands (an explicit
`client=` directive) are unchanged.

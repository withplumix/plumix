---
"@plumix/core": minor
"plumix": minor
---

Fixes `.default()`, which narrowed the read type to a non-optional value while nothing supplied
that value on read. `decodeMetaBag` walked only the keys storage held, so a declared default
existed as a type and an admin form prefill and nowhere else — `text("tone").default("warm")` typed
as `string` and read back `undefined` on any row saved before the field was added, or written
through the RPC.

The decoder now fills a declared default wherever the bag has no key. A repeater row and a group
value are bags in their own right, and both builders permit arbitrary nesting, so decoding recurses
and the fill reaches every depth `InferFields` claims. The value travels the same decode path a
stored one does, so a `.returns("date")` default reads back a `Date`. Absence is the only trigger —
storage cannot hold `undefined`, so a stored `null` is a value someone chose and keeps its place.
An absent container stays absent rather than being synthesized from its members' defaults, which is
what its own read type says.

Making container decode recursive also fixes two adjacent gaps in the same read shape: a
`.returns("date")` field nested in a group or a repeater row is now projected to a `Date` rather
than left as its stored string, and a legacy reference value nested more than one level deep is now
healed.

`storedMeta` is untouched, which is the split that matters: `.whereMeta()` and the rule predicates
compare against the stored bag, so a defaulted key still does not match until something saves it.
A default is now visible on every read surface — templates, the admin RPC, and the REST API for a
field that opted in with `.showInApi()`.

`settings.get` fills its group's defaults too. Settings have no decode pass of their own, so that
one is a fill and nothing more: a `.returns("date")` settings field still reads back its stored ISO
string.

A field key of `__proto__`, `constructor` or `prototype` is now rejected at registration for
top-level meta fields, as it already was for repeater and group members. Such a key passed the key
regex and then swapped the prototype of the decoded bag instead of storing a value.

Internals: `decodeMetaBag` and `loadMeta` take a `MetaScope` — a field list paired with a lookup
over it — since filling a default needs the fields storage never mentions. `metaScope(fields)`
builds one and `metaScopeCache(listFields)` memoizes per scope key, so an archive resolves each
entry type's field list once rather than once per row. `listTermMetaFields` and `listUserMetaFields`
join the existing `listEntryMetaFields`.

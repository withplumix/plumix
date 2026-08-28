---
"@plumix/core": minor
"plumix": minor
---

Publishes `toMetaBoxFieldEntry`, and puts it on `plumix/fields` beside `compileMetaBoxFields` and
the builders the pair operates on. Together they are the transform a `fields` array already goes
through on its way to the admin, so a plugin that renders fields on a surface core does not runs
them instead of reimplementing the projection.

`compileMetaBoxFields` folds an array of fluent builders, plain definitions, or a mix of the two
down to definitions — it was already on the root barrel and is now reachable from `plumix/fields`
too. `toMetaBoxFieldEntry` is new: it projects one definition into the wire-shaped entry the
renderer reads, recursing into repeater rows and group members, and dropping the `sanitize` and
`validate` callbacks, which run on the server and have no serialisable stand-in. The types a
renderer needs to name what it is handed — `FieldBuilder`, `MetaBoxField`, `MetaBoxFieldInput` and
`MetaBoxFieldManifestEntry` — are published on `plumix/fields` alongside them.

The pair is the transform only. Registration also validates: key shape, the reserved `__plumix_`
prefix, duplicate keys, the per-box field cap, and `.visibleWhen()` rules naming a field the box
declares. A caller projecting an array itself owns those checks.

The per-field projection moves out of the build-time manifest projection into
`plugin/fields/manifest-entry.ts`, so reaching for it no longer drags the block and registry graph
behind it. Existing `@plumix/core/manifest` consumers are unaffected.

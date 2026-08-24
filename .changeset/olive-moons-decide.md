---
"@plumix/core": minor
"@plumix/blocks": minor
"@plumix/admin": minor
---

Runs `settings.upsert` through the field pipeline, so a settings value is decoded on the way in
rather than type-checked one read at a time on the way out.

`settings.value` was `unknown` on the column because a value reached it straight off the RPC without
passing any pipeline — nothing had proved its shape, so every reader narrowed it by hand. Keys a
registered group owns now take the same write path as entry and term meta (coercion, `.sanitize()`,
the declared constraints); keys nobody registered keep the laissez-faire write but still have to be
JSON. The column, `SettingsBag`, and the `settings.get` / `settings.upsert` bags now say so, as does
`SiteSettings` in `@plumix/blocks`, which is the same bag one hop downstream.

Three consequences for callers. A registered field's declared constraints are enforced where they
previously were not: a `number("per_page").max(50)` rejects `99` instead of storing it, and the
rejection arrives as a `CONFLICT` with `reason: "settings_invalid_value"` carrying the same
`{ path, message }` error list the meta write path returns — the settings card pins each one on the
input it addresses, as the entry and term forms already did. A value arrives in its declared shape:
the string `"10"` on a number field lands as `10`. And clearing a key a registered field marks
`.required()` is refused rather than silently deleted, which is what the same `null` already meant on
entry and term meta.

The meta pipeline's own scalar coercion decodes with valibot instead of hand-written `typeof`
ladders, and `.sanitize()` output is decoded on the same terms as its input. The descriptor types a
callback's return as `JsonValue`, but nothing enforced that at runtime: a callback handing back a
`Date` used to reach storage as one and become whatever `JSON.stringify` made of it later. Three
edges move with it, all of them reachable only from a callback that ignores its declared return
type. Returning `undefined` still means "write nothing", but now short-circuits the remaining
constraints instead of running them against a value there is none of — on a `link()` or `color()`
field that turns a rejected write into a skipped one. Returning `null` from a `string` / `number` /
`boolean` field's callback is `invalid` rather than stored as `null`. And returning a value the
field's declared type cannot hold is `invalid` rather than stored.

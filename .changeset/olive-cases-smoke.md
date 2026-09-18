---
"@plumix/core": minor
---

Fixes a `type: "string"` or `type: "number"` meta field reading differently depending on which bag a consumer holds. The decode no longer widens a stored value to the field's declared type, so it agrees with the three readers that cannot decode — a `WHERE` over the JSON column, a raw row off a lifecycle event, and `storedMeta` behind `whereMeta`. A stored `42` under a `string` field now reads `42` rather than `"42"`, which is what `whereMeta` was already comparing against while `StoredMetaOf` typed its key as `string`.

This completes the change #2426 made for `boolean`: all three scalars now read as stored, so a field gives one answer on every surface.

Writes are unchanged: a number sent to a `string` field is still stored as `"42"`, and text sent to a `number` field is still stored as `7`. Only a row that bypassed the pipeline can hold an off-schema value — a legacy row written before a plugin changed the field's declared type, an import, or a direct write. Publishing the entry settles it.

Upgrade note: on those rows the value now reaches a theme or plugin as its stored form while its read type still says `string` or `number`. A template calling a string method on such a field will throw where it previously received coerced text, and a container stored under a `string` field arrives as the object rather than as its JSON text.

Not every effect is loud. The entry editor seeds its form from the decoded bag, so an off-schema row now opens with a blank input where it used to show coerced text — a `number` field storing `"7"` renders empty rather than `7`, and a container under a `string` field renders empty rather than its JSON. Nothing is lost by opening the entry, since an untouched field still diffs to nothing, but typing into that input overwrites the stored value.

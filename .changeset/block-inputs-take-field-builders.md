---
"plumix": minor
---

Adds meta-box field builders to a block's `inputs`: `defineBlock` accepts `repeater`, `group`, `select` and the other `plumix/fields` builders, and `contentInput` marks one as a content input. Every save now settles those attributes like meta fields, in the same mode meta uses for that save (lenient for autosaves and drafts, strict for live saves and on publish), storing the sanitised value and refusing an invalid one with an `invalid_attribute` issue that carries the field's `{ path, message }` errors. Outside a publish, a value an entry already holds still saves unchanged.

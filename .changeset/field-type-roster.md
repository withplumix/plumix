---
"@plumix/core": minor
---

Derive the built-in field-type vocabulary from one runtime roster.

The set of built-in meta-box `inputType` names now has a single source — a
per-family roster (`STRING_INPUT_TYPES`, `TEMPORAL_INPUT_TYPES`,
`SCALAR_INPUT_TYPES`, `REFERENCE_INPUT_TYPES`, `CHOICE_INPUT_TYPES`,
`STRUCTURAL_INPUT_TYPES`, `LEGACY_INPUT_TYPES`, and the derived
`CANONICAL_INPUT_TYPES`) exported from `@plumix/core/fields`. The string and
temporal input-type unions derive from these arrays, and a compile-time
exhaustiveness guard — enabled by splitting `MetaBoxField` into the newly
exported `CanonicalMetaBoxField` and the legacy catch-all — binds the roster
to the union, so the two can no longer drift. The admin's reserved-name set
and its unknown-type warning now derive from the roster instead of hand-synced
copies.

The only consumer-visible behaviour change: the built-in `group` and `link`
field types are now **reserved**, so a plugin can no longer register a custom
field type under those names and shadow the host control (they previously
slipped through the hand-maintained set). `media` / `mediaList` remain
unreserved — they are plugin-contributed reference kinds whose own admin
renderers register through the same seam.

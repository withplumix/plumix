---
"@plumix/core": minor
"plumix": minor
---

Types `storedMeta` on a targeted rule's entry and term, so `.where()` reads the stored meta bag at
the same shape `.whereMeta()` is checked against.

`ResolvedEntryFor<K>` and `ResolvedTermFor<K>` — the projections behind `forEntryType(...).where()`
and `forTermTaxonomy(...).where()` — folded `meta` to `MetaOf<K>` / `TermMetaOf<K>` and left
`storedMeta` as the base bag. So the documented escape hatch — the comparison `.whereMeta()`'s `===`
cannot express — handed back untyped values: `data.entry.storedMeta.filedOn` had no autocompletion
and no error on a typo'd key, on the one bag whose shape the registry already knew. Both projections
now fold it to `StoredMetaOf<K>` / `StoredTermMetaOf<K>`.

`ResolvedEntry.storedMeta` and `ResolvedTerm.storedMeta` widen from `JsonObject` to the new
`StoredMeta` (`Record<string, unknown>`), mirroring how `meta` is the open `ResolvedMeta` — a
projection can only replace a base property with a narrower one if the base is open, and the folded
stored shape is not `JsonObject`: a field left unmarked by `.required()` folds to `T | undefined`,
and a `json()` or `richtext()` field to `unknown`. Where the fold is out of reach the values now
read as `unknown` rather than `JsonValue`: an untargeted `ResolvedEntry`, and `data.entries[n]` in
an archive or taxonomy rule, where a taxonomy spans entry types and there is no single shape to
fold. `data.entry` and `data.term` on a targeted rule — where the fold is available — gain the
field's real stored type.

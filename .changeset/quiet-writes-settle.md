---
"plumix": minor
---

Adds `settleMeta` to `plumix/db`. A plugin writing meta directly through `ctx.db` skips the field pipeline, so a `1` under a `toggle` field was stored as `1` and read back as `1`, not `true`. Pass the bag through `settleMeta(ctx, owner, meta)` before writing it. `owner` names the entry type, taxonomy or settings group it belongs to (`{ entryType }`, `{ taxonomy }`, `{ settingsGroup }`), or `"user"`. The value is converted as a save would convert it, including inside repeater rows and groups. A value no field type accepts, and a key no field declares, come back unchanged.

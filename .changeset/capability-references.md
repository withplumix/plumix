---
"plumix": minor
---

Adds `entryCapability(type, action)` and `termCapability(taxonomy, action)` to `plumix/plugin`, so a plugin names an entry or term capability by what it guards instead of spelling `entry:<type>:<action>`. Every capability slot accepts the reference: `ctx.auth.can`, `requireCapability`, route and REST `auth`, `registerLookupAdapter`, `registerAdminPage`, dashboard widgets, meta boxes and field `.capability()`. A reference resolves to the namespace a pooled type (`capabilityType`) gates under, and manifests and `FORBIDDEN` payloads still carry the resolved string. `resolveCapability` spells a reference for a denial payload a plugin builds itself. Also adds `canDeleteEntry` / `assertCanDeleteEntry`, which publish core's trash rule: `delete`, plus `edit_any` for someone else's row.

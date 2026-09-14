---
"plumix": minor
---

Resolves entry type and term taxonomy visibility once, at registration. A registered type (`RegisteredEntryType`, `RegisteredTermTaxonomy`) now carries `isPublic`, `showUI`, `showInSidebar`, `excludeFromGenericRpc` and `excludeFromSearch` as plain booleans with the defaults applied, and the admin manifest's `isPublic`, `showUI` and `showInSidebar` are always booleans too. Removes `resolveEntryTypeVisibility` and `resolveTermTaxonomyVisibility` from `plumix` and `plumix/plugin`.

To upgrade, read the flag off the registered type instead of resolving it: `resolveEntryTypeVisibility(type).showUI` becomes `type.showUI`, and a check such as `type.isPublic !== false` becomes `type.isPublic`. A test that writes `plugins.entryTypes` or `plugins.termTaxonomies` directly builds the value with `toRegisteredEntryType` / `toRegisteredTermTaxonomy` from `plumix/test`, and a hand-built manifest fixture sets `isPublic`, `showUI` and `showInSidebar` explicitly.

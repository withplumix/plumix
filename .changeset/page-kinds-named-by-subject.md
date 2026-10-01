---
"plumix": minor
---

Names every page kind after what the page is about, so the route, the resolved node, the current request entity and the template data all use the same words (ADR 0025). The kinds are `entry`, `entryType`, `term`, `author`, `date`, `archiveType`, `frontPage` and `search`. A theme or plugin that matches on `kind` needs these renames, and there are no aliases:

- **`RouteIntent`** (including a `registerRewriteRule` intent and the `archive:entries` archive): `single` → `entry`, `archive` → `entryType`, `taxonomy` → `term`, `front-page` → `frontPage`, `custom` → `archiveType`.
- **`ResolvedEntity`** (`ctx.resolvedEntity`) and **`RendererQueriedEntry`** (`useQueriedEntry()`): `archive` → `entryType`.
- **`ResolvedNode`**: `content` → `entry`, `content-type-archive` → `entryType`, `front-page` → `frontPage`, `custom` → `archiveType`.
- **`TargetMatcher["nodeKind"]`** now derives from `ResolvedNode["kind"]`, so it gets the same renames.
- **`TemplateData`**: `archive` → `entryType`, `taxonomy` → `term`, `custom` → `archiveType`. `frontPage` is unchanged.
- **`GenericTier`**: `archive` → `entryType`, `taxonomy` → `term`.
- **`ListingPageTarget`** (`resolveListingPage`): `archive` → `entryType`, `front-page` → `frontPage`.
- **Generic tier builders**: `archive()` → `entryType()`, `taxonomy()` → `term()`.
- **Guards**: `isArchive` → `isEntryType`, `isTaxonomy` → `isTerm`, `isCustom` → `isArchiveType`.
- **Data types**: `ArchiveData` → `EntryTypeArchiveData`, `TaxonomyData` → `TermArchiveData`, `CustomArchiveData` → `ArchiveTypeData`.

`forEntryType`, `forTermTaxonomy`, `forArchiveType`, the targeted `.archive` selector and the other builders, guards and data types keep their names. The debug bar labels an `entryType` or `term` tier rule by its new tier name, and the `route.intent` telemetry attribute reports the new intent kinds. No URL changes.

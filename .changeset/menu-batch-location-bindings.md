---
"@plumix/plugin-menu": patch
---

`getMenusForLocations` batches location-bound menu resolution: one `settings` read covering every requested location plus one shared resolve pass over the bound slugs, so resolving several registered locations directly no longer fans out per location. `getMenuForLocation` keeps its signature as the single-location wrapper, and each location's `menu:tree` hook pass still sees its own `location` — even when two locations bind the same menu.

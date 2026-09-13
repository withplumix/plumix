---
"@plumix/plugin-menu": minor
---

Removes `getRegisteredLocations` and `clearRegisteredLocations` from `@plumix/plugin-menu/server`. The locations declared in `menu({ locations })` now belong to the install that declared them, so a second app booted in the same process no longer replaces the locations the menu admin validates against.

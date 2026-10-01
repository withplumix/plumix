---
"plumix": minor
---

Adds localized screen-reader announcements to `SortableList`. A keyboard drag now announces the item's position ("Picked up item 1 of 3.") in the admin's language instead of dnd-kit's English defaults, which read out the raw item id. `SortableList` now requires an `announcements` prop, so plugins that render it must pass one.

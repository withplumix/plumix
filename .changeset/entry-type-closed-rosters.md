---
"@plumix/core": minor
---

Types `registerEntryType`'s `menuIcon` and `registerTermTaxonomy`'s `menuIcon` as the closed set of icon names the admin actually renders, so an unrecognized icon name is now a compile error instead of a silent fallback to a generic icon. Drops the nine `EntryTypeLabels` keys no plugin or admin surface ever read (`itemUpdated`, `itemPublished`, `itemPublishedPrivately`, `itemScheduled`, `itemTrashed`, `itemRevertedToDraft`, `itemsList`, `itemsListNavigation`, `filterItemsList`) — a plugin declaring one of these was configuring a no-op. `capabilityType` and `supports` stay open: `capabilityType` is a real, intentionally shareable namespace, and `supports` is documented as conventional rather than closed.

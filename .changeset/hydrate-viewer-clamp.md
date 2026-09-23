---
"plumix": minor
---

Fixes reference hydration treating a field's `scope.status` as permission. An entry reference field declaring an unpublished status — `entry("related", ["post"]).status("draft")` — skipped the viewer clamp entirely, so the referenced titles, slugs and URLs resolved for whoever the page reached, an anonymous reader included. A status now narrows the rows the viewer may already have rather than replacing the question, so it can only ever show less.

Hydration also admits a viewer's **own** unpublished entries. The clamp asked only for `edit_any`, so an author referencing their own draft got nothing back on their own preview; `edit_own` over the rows they wrote is the rule every other read surface uses.

Together these narrow what an admin field built on the old behavior returns: a `.status("draft")` field that handed a contributor every author's drafts now hands them their own. The rule itself moves to `referenceableEntryRows` beside `canReadEntry`, so reference resolution and the entry-read surfaces are one rule under two compositions — hydration asks nothing about `read` or `isPublic` for a _published_ row, because a referenced type rendered inline often has no page of its own and no reader holding a capability over it.

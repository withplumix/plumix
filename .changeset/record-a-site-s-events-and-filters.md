---
"plumix": minor
---

Adds `site.events` and `site.filters` to `testSite`, which record every event the site emitted and every filter it applied with no spy set up first. A test asserts with `assertEmitted(event, payload?)`, `assertNotEmitted(event)`, `emitted(event)`, `assertApplied(filter, input?)` and `assertNotApplied(filter)`, each taking the declared event or filter rather than its id.

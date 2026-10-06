---
"@plumix/core": minor
---

Adds a `routes` config to turn off core's author, date and search routes, and answers 404 for a date archive with no entries. A route family set to `false` is never compiled, so its URLs fall through to whatever else matches or to 404, and the admin's user screen drops its `/authors/` hint when author routes are off.

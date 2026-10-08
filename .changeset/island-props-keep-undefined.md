---
"@plumix/core": patch
---

Fixes island props that are `undefined` on the server arriving as `null` in the browser. The comments plugin's form island no longer logs React's "`value` prop on `input` should not be null" error.

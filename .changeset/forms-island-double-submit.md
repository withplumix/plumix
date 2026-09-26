---
"@plumix/plugin-forms": patch
---

Fixes the form block posting one submission twice when it is submitted twice in the same tick, such as Enter pressed twice. The block now blocks a second submit while one is pending, the same way `usePlumixForm` does.

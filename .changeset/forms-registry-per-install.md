---
"@plumix/plugin-forms": patch
---

Fixes a `forms()` descriptor installed into two apps sharing one form registry. Booting the second app no longer drops the forms other plugins contributed to the first, or shows the first app the second app's forms.

---
"@plumix/plugin-forms": patch
---

Fixes `PlumixForm` and `formWire` resolving a slug against whichever app booted last in the process. They now read the forms of the app serving the request, so call `formWire` from a template's `render` rather than at module scope, where it returns `undefined`.

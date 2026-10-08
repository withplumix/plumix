---
"plumix": patch
---

Fixes the `INEFFECTIVE_DYNAMIC_IMPORT` warning every site build with the forms plugin printed: a plugin's source-locale catalog is now imported up front rather than lazily.

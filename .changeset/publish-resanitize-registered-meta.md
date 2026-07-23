---
"@plumix/core": patch
---

`entry.publish` now re-sanitizes the registered meta keys of the autosave bag before promoting it onto the live row, rather than promoting verbatim. The write-time gate (previous release) only canonicalizes autosaves written after it deployed; a draft persisted before that fix could still carry unsanitized values onto a published entry. The publish path now runs each registered field's `.sanitize()` pipeline and passes unregistered keys (data from uninstalled plugins) through untouched, so it never rejects a legitimate live bag as `meta_not_registered`. The gate is forgiving like the read path: because a whole bag is promoted rather than a caller's touched patch, a value that fails validation is treated as schema drift and kept as stored rather than aborting an unrelated publish — the live write path remains the gate for user intent. Field capabilities and reference existence are intentionally not re-checked at publish.

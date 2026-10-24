---
"@plumix/plugin-forms": patch
---

Stores the form signing secrets through `ctx.settings.write`, so minting one fires `settings:group_changed` for the `forms_internal` group, which the audit log records by key name.

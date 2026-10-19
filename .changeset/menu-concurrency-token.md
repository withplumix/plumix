---
"@plumix/plugin-menu": minor
---

Replaces the menu's `version` with the opaque `etag` and leases a menu to the editor who has it open. `menu.list`, `menu.get`, `menu.create` and `menu.save` return `etag` instead of `version`, and `menu.save` takes it back as a required `ifMatch`. A save from a stale copy is refused with a `CONFLICT` of reason `etag_mismatch` before it writes any item; `version_mismatch` is gone. The new `menu.lease.acquire`, `menu.lease.renew` and `menu.lease.release` procedures share the lease with the term editor, and `menu.save` refuses a write while another user holds it, unless it passes `takeOver: true`. In the admin, the menu editor opens read-only with a banner naming who is editing and offering **Take over** and **Back**. A stale save shows the conflict with **Keep mine** and **Load theirs** in place of the old "Reload to see latest" banner.

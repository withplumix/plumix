---
"@plumix/core": minor
"@plumix/admin": minor
"plumix": minor
---

Adds conditional field visibility authored from field references: condition factories typed per driving field (`.is()`, `.gt()`, `.isOn()`, containment/count on multi-select) feed `.visibleWhen()`/`.orVisibleWhen()` groups that show/hide admin fields live and skip server-side validation of hidden fields.

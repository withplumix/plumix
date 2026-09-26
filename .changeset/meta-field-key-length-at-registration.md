---
"@plumix/core": patch
---

Fixes meta field keys longer than 200 characters registering fine and then failing every write. Registering a meta box, settings group, repeater sub-field or group member with such a key now throws at registration (`meta_box_field_invalid_key` / `sub_field_key_invalid`), and both errors state the 200-character cap next to the allowed pattern.

---
"@plumix/core": patch
---

Fixes meta reaching the live surface without a field it requires. Two paths let it through.

- **An edit that switches a required field visible without supplying it.** A live edit to a published entry, any edit to a scheduled one, and every term or user meta edit validated only the keys it sent. So changing a condition driver — `layout: "video"` making a required `video_url` visible — was accepted, and the entry went live with a bag the publish gate would have rejected. Such an edit now fails with the per-field error the publish gate gives, naming the field it left empty. Draft edits stay lenient.
- **Creating an entry straight to `published` or `scheduled`.** This validated only the meta it was sent, so a required field it omitted went live missing. It now runs the same whole-bag check as publishing a draft.

Re-sending a driver's current value (stored or default) is never blocked by older drift on its dependents. A field the author lacks the capability to write is never held against them, which is the rule the publish gate already applies. A required field is not satisfied by its default, since a default is shown on read but never stored.

Conditions are now judged against the meta the edit lands on, with each value as the pipeline will store it (a number input's `"10"` counts as `10`) and each declared default standing in for a key storage lacks. The edit path and the publish gate agree on this. Two consequences:

- An edit carrying just a dependent field is judged by its driver's stored or default value. When that value hides the field, the write to it is dropped, as it already was when the edit carried the driver itself.
- Publishing no longer demands a field whose driver's default hides it. Previously the gate treated a driver missing from storage as showing its dependents, so it could require a field the editor hid.

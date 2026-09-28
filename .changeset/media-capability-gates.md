---
"@plumix/plugin-media": minor
---

Changes who may delete media and finish an upload. `media.delete` now follows core's trash rule. An owner needs `delete`, which contributors now hold for media. Deleting someone else's asset also needs `edit_any`, so it is still editor-only. A token without the `delete` scope can no longer delete its own media. Finishing an upload, whether through the worker upload route or `media.confirm`, now needs both ownership of the draft and media `create`. A `create`-scoped token succeeds at both steps, whatever the storage configuration. An owner without `create`, or any non-owner, is refused at both.

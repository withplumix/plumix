---
"@plumix/plugin-media": minor
---

Media's edit gate now asks the framework's shared entry edit rule rather than checking ownership against a hardcoded `entry:media:edit_any` string. Two effects: the gate follows the capability namespace if the media type is ever pooled onto another, and touching your own asset now requires `entry:media:edit_own` rather than ownership alone.

This covers both `media.update` and the worker-routed `PUT /_plumix/media/upload/<id>`, so a caller holding `entry:media:create` without `edit_own` can still mint an upload URL but is refused when pushing the bytes. Every stock role that can upload also holds `edit_own`, so the one caller this reaches is an API token scoped to `entry:media:create` alone — and only where uploads fall back to the worker route rather than a presigned PUT.

Deleting an asset still turns on `entry:media:delete`, with ownership alone sufficient, and finalizing an upload is still owner-only.

---
"@plumix/plugin-media": minor
---

When a media item is trashed or deleted, through the plugin's own `media.delete` or the generic entry procedures, the plugin asks the image-delivery slot to purge the item's variants, so a transform rendered while it was published stops answering once it is hidden.

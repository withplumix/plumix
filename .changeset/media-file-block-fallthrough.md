---
"@plumix/plugin-media": minor
---

Fixes the file block ignoring the author's manual filename and MIME type when the picked asset has none — the link read "Download" and the meta label went missing. The file block's placeholder and "Download" fallback and the image block's "No image" placeholder are now localized, and the compiled catalogs are importable from `@plumix/plugin-media/locales/*`.

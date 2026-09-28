---
"@plumix/plugin-media": patch
---

Fixes the media library's error banner showing raw text such as "Conflict" when an upload, delete or alt-text update fails. The banner now shows localized copy: the existing messages for a site with no storage or a rejected file, the too-large, unsupported-type and missing-length messages for a refused upload, and "Something went wrong. Try again." for anything else.

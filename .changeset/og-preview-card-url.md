---
"@plumix/plugin-og": patch
---

Fixes a page rendered through a preview link advertising an `og:image` card URL the card route answered with a redirect. The card is now computed from the published entry on a preview render too, so a shared preview link unfurls with the image the public page carries.

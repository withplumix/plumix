---
"@plumix/core": minor
---

Allows multi-segment `rewrite.slug` and `hasArchive` bases, so a taxonomy registered with `rewrite: { slug: "insights/category" }` serves its terms, later pages and feeds at `/insights/category/<term>`, and an entry type can live at `learn/courses`. A near-miss base now fails at boot with a message that names the segment at fault, and for a stray leading or trailing slash shows the value to write instead.

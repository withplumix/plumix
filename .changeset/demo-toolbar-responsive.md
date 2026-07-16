---
"@plumix/runtime-cloudflare": patch
---

Make the demo toolbar responsive. Its contents used to wrap onto several cramped lines on narrow screens; it now stays a single-line pill at every width — the countdown and controls never wrap (`white-space: nowrap`), the pill is capped to the viewport, the deploy CTA shortens to "Deploy" on phones, and the bar clears the iOS home indicator via the safe-area inset.

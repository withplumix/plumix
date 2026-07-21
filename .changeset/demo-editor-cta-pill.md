---
"@plumix/runtime-cloudflare": minor
---

Move the demo sandbox's "Try the editor" call-to-action into the floating demo pill and redesign the loading interstitial.

Anonymous visitors on the read-only showcase now get a "Try the editor" button in the demo pill (previously it lived in the example theme's header), while session holders keep the countdown / reset / deploy pill. The pill is now injected for anonymous requests too, with the variant chosen per request from the demo session cookie. The `/demo` provisioning screen is a centered, on-brand card with a single loading indicator, replacing the browser-default text pinned to the top-left.

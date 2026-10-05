---
"plumix": minor
---

Adds a navigation direction to a theme's page transitions. When `viewTransitions` is on, public pages carry a small inline head script that tags each transition `nav-forward` (a link click, or a step forward through history), `nav-back` (the back button) or `nav-replace` (a replaced history entry), so your theme's CSS can slide pages each way with `:active-view-transition-type()`. Browsers without the Navigation API (Safari before 26.2) run the transition untagged. Editor canvas and preview renders carry no script.

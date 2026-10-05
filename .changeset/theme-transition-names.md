---
"plumix": minor
---

Adds `transitionName(prefix, key)` and `viewTransitionTypes` to `plumix/theme`. `transitionName` builds a `view-transition-name` the browser can't silently drop, whatever the key holds (a number, a leading digit, spaces, punctuation, a reserved word like `none`), and gives the same name on server and client. `viewTransitionTypes` holds the transition type names (`nav-forward`, `nav-back`, `nav-replace`) for matching navigation direction in CSS.

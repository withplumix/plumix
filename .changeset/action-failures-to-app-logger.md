---
"plumix": patch
---

Fixes a throwing action handler being reported only to `console.warn`: during a request the failure is now logged as an error through the site's logger, naming the hook and the plugin (`core` for core's own); outside a request it goes to `console.error`. The other handlers and the operation that fired the action still carry on.

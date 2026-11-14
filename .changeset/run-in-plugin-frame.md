---
"plumix": minor
---

Adds `ctx.runInFrame(fn)` to the plugin setup context: it runs `fn` in that plugin's frame, so `ctx.cache` inside it names that plugin. A plugin context extension is now bound to the plugin that calls it, so its `this` is the caller's setup context whatever receiver the call names, and an extension runs what the caller handed it in the caller's frame with `this.runInFrame`.

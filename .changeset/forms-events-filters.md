---
"@plumix/plugin-forms": minor
---

Adds `form`, exported from `@plumix/plugin-forms`, holding the plugin's `submitted` event, so another plugin subscribes with `ctx.events.on(form.submitted, ({ submission, candidate }, ctx) => …)` with no `declare module`. It is still emitted once per accepted submission, after the row is stored and the form's own handler ran. The plugin now needs `plumix` 0.27.0 or later.

Breaking: the `form:submitted` string name is removed from `ActionRegistry`. Replace `addAction("form:submitted", (submission, candidate) => …)` with `ctx.events.on(form.submitted, ({ submission, candidate }) => …)`.

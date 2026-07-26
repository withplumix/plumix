---
"@plumix/blocks": minor
---

Add a dev-only client island error overlay.

When an island fails in `plumix dev` — during hydration, after hydration (a
render/effect throw, captured with its React component stack), or via an async
error or unhandled rejection — a non-blocking corner badge now appears and
expands to a panel showing the message, the component stack, and the stack
trace, rendered through the shared dev error renderer inside a Shadow DOM root
so a broken theme can't style it and it never goes full-screen. A failing
island no longer breaks the rest of the page or the other islands; multiple
errors are counted and navigable, and the overlay is dismissable. Everything
stays gated on `process.env.PLUMIX_DEV` and tree-shakes out of production
island bundles.

---
"plumix": minor
---

Removes the `user` argument from the dispatcher test harness's `dispatch` (`plumix/test`). The harness no longer puts a user on the request context, matching the runtime, so a signed-in request carries its session: replace `h.dispatch(request, user)` with `h.dispatch(await h.authenticateRequest(request, user.id))`, and `h.dispatch(request, null, address)` with `h.dispatch(request, address)`. `h.fetch(path, { as })` is unchanged.

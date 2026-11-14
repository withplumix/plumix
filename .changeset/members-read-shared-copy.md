---
"plumix": minor
---

Serves signed-in visitors the cached copy of public pages that don't depend on who is viewing. A request with a session to a page with no access policy gets the copy an anonymous visit stored, leaving `private, no-cache`, and its own render is never stored. Staff who get the admin bar, and members whose own locale differs from the request's, still render live.

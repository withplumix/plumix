---
"@plumix/plugin-comments": minor
---

Accepts a comment posted as a plain HTML form, and ships the markup that makes that worth having.

`POST /_plumix/comments/submit` is now a `formPost` route, so a `<form method="post">` reaches it
without the `X-Plumix-Request` header a browser cannot set on an ordinary submit. It reads
urlencoded bodies as well as JSON, coercing `entryId` and `parentId` before validation while
keeping the schema strict on both paths, and chooses the answer's shape from the request's
content-type rather than from `Accept` — a `fetch` sends no `Accept` header of its own, so
negotiating on it would have turned every existing scripted caller's 200 into a redirect. An
accepted comment answers 303 back to the page the form was on, resolved from a hidden `returnTo`
field first and the `Referer` second, both held to the site's own origin and refused the endpoint's
own path. Every answer is `no-store`.

Two new subpaths render the form. `PlumixCommentForm` from `@plumix/plugin-comments/theme` is the
plugin's own markup — labelled controls, an error summary, the honeypot — dropped into a template,
upgraded in place by an island where JavaScript runs. `usePlumixCommentForm` from
`@plumix/plugin-comments/hooks` is the same submission with none of the markup, for a theme writing
its own controls. `loadThread` and a hand-written form are unaffected.

Owning the markup is what lets a refused comment be answered with the form back, carrying what the
visitor typed and the refusal against the field that produced it. Every exit of the handler now
goes through one negotiated `accepted` or `fail`, the honeypot's fake success included — answering
a trapped submission differently from a real one is how a bot learns it was caught.

One behaviour to know about: a request admitted by the `formPost` exemption is handed an
authenticator that resolves nobody, so a signed-in author posting without JavaScript is filed as
the anonymous commenter they cannot be told apart from. Under the default `first_time` mode that
costs them their first comment's fast path and its `authorUserId` link, and only their first. The
plugin's new documentation page says so.

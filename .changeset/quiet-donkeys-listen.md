---
"@plumix/plugin-og": minor
"@plumix/core": minor
---

Refuses a social card for an entry the access layer keeps from anonymous visitors.

A card carries the entry's title, sits at a sequential id anyone can walk, and is served from a shared cache. It was gated on publication status and the entry type's `isPublic` alone, so an entry behind an `access` policy — one whose page redirects a signed-out visitor to sign-in, or answers a 402/403 — still had a card at `/_plumix/og/entry/<id>.<ext>`. The route now asks the access layer too, and answers `404` when the page is gated.

The head asks the same question, so it never advertises a URL the route refuses — including on a page rendering for a signed-in visitor who _can_ read it, since the scraper that follows the URL cannot. A _soft_ gate keeps its card on purpose: that page serves a public teaser at 200, so the teaser is meant to unfurl.

Core gains `entryAllowsAnonymousAccess(ctx, entry)`, which resolves an entry's effective policy — the type's `access.default`, or the per-entry choice that overrides it — against an anonymous principal and reports whether the page renders. Anything publishing a public artefact on an entry's behalf can now ask the same question its page does, rather than approximating it.

A `?preview=` render also reports the entry's per-entry access choice correctly now. The autosave overlay stripped the reserved key, so a template read the type default rather than the choice actually gating the entry — and unlike the template pick, an unsaved access pick must not drive the preview, because the gate resolves its policy from the persisted row.

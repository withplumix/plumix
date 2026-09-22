---
"@plumix/plugin-comments": minor
"@plumix/plugin-feeds": minor
"@plumix/plugin-seo": minor
---

Applies an entry type's access policy to the surfaces that publish entry data away from the entry's own page. A type registered with `access` is gated on its own page, but three plugins republished it elsewhere to visitors the gate would have turned away.

`@plumix/plugin-comments`: the public thread route, the REST resource and the submit handler now resolve the entry's policy before answering. Previously an anonymous visitor could read every approved comment on a members-only entry — and post to it — knowing only the entry id. All three routes are `auth: "public"`, which core answers ahead of the access gate, so they now share one `resolveCommentableEntry` that asks. A gated entry answers as a missing one, so the refusal does not report which ids exist.

**Commenting on a gated entry now closes for everyone, including the members the gate admits.** A public route carries no principal to resolve a policy against, so the question these three ask is whether an _anonymous_ reader may see the entry — and on a gated entry the answer is no whoever is asking. A member still sees the rendered thread on the entry's own page, which is gated and therefore safe, but the form and the "load older comments" control there will refuse. If your site runs members-only content with comments, this removes a feature you had. Serving those surfaces to the member the gate admits needs a public route that can carry a policy, which core does not have yet.

`@plumix/plugin-feeds`: a policied entry type is no longer syndicated. Its entries stay out of the site, author, date and term feeds, and the type registers no feed of its own to be asked for. A site whose only public entry type is gated now serves no feed at all, since a feed with no syndicatable type has nothing to carry.

`@plumix/plugin-seo`: a policied entry type gets no sitemap scope — and so no sub-sitemap route — and IndexNow is not told when one of its entries is published. The same now holds for a plugin archive declaring both `access` and `sitemap`. The type keeps its SEO meta box, its SERP preview and its settings keys in the editor: search copy is still worth writing for a page a member reaches, and removing the keys would orphan values a site had already saved.

A feed, a sitemap and an IndexNow ping are read by a client carrying no session and served from a shared cache, so there is no principal to resolve a policy against: those three exclude the whole type, as `@plumix/plugin-search` already does for its index. A type declaring `access` is therefore out even where an individual entry's policy would have admitted anyone.

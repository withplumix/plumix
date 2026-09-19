# Image roles are an open set, and readers ask for a role, never a meta key

A media field tagged `.featured()` or `.ogImage()` used to be read by three
separate walks — core's `entryRoleImage`, the SEO sitemap and the og card chain —
each deciding for itself which fields carried a role, all of them blind to fields
nested in a group, and a theme had no way in at all: the demo theme cast
`entry.meta.featuredImage` by its key. We made the role the thing a reader asks
for. Core resolves every role once at registration into an index per scope
(entry, term, user), projects the resolved images onto the entity as
`images.<role>` out of the hydration batch the page already runs, and reads an
image through a typed `image()` method on the lookup adapter that produced it
rather than by sniffing the payload.

Roles are an **open set**. Core ships `featured` and `ogImage`; anything else —
`hero`, `thumbnail`, `avatar` — is declared by a plugin or theme with
`registerImageRole` and typed by declaration merging, so a new image purpose never
needs a core change. The built-ins are the roles more than one independent plugin
reads: `ogImage` is honoured by both `plugin-seo` and `plugin-og`, which depend on
neither each other nor on media, so it cannot be owned by any one of them. Keeping
it in core does not breach ADR 0002: a role only tags a field and emits nothing, so
a site with no plugin reading it is missing output, not producing wrong output.

A role may sit on a field inside a group, never inside a repeater — a role names
the entity's image, and a repeater would give it one per row. A role field only
ever holds an image: tagging implies `accept("image/")`, and an accept that admits
anything else fails when the field is built.

## Considered options

- **Closed pair in core** (rejected). Every new purpose — a listing thumbnail
  distinct from the share image — would be a core edit.
- **Plugins co-declare shared roles** (rejected). Letting seo and og each register
  `ogImage` when their options match puts shared ownership into the registry's
  claim model to serve a single role.
- **Readers keep walking fields** (rejected). This is how the three walks drifted
  apart in the first place.

---
"@plumix/core": minor
---

Rejects a `rewrite.slug` the router cannot compile into a safe route.

`registerEntryType` / `registerTermTaxonomy` took any `rewrite.slug` and put it straight into a
`URLPattern` at boot, so two shapes failed quietly. A slug with a `/` in it compiled and its archive
rendered, but the feed router reads only the first path segment when it matches
`/<taxonomy>/<term>/feed`, so term feeds under a nested base stopped resolving with no error
anywhere. A slug carrying URL-pattern syntax was worse: `":anything"` or `"*"` widened the compiled
rule into `/:anything/:slug`, which matches every two-segment URL on the site and swallows other
plugins' pages.

The slug now gets the same single-segment check `hasArchive` already had — one lowercase segment
matching `/^[a-z0-9][a-z0-9-]*$/` — and an invalid one throws at boot, naming the registration and
the offending slug, instead of starting a site with a hole in it.

The empty string stays legal for an entry type, where it mounts the type at the URL root — that is
how `@plumix/plugin-pages` serves `/about`. A taxonomy has no root form, so `""` is rejected there
rather than compiling to `//:term`.

The hazard was reachable by any plugin, but `blog({ post: { rewrite: … } })` made it reachable from
a site's own config, so the caveat that documented it is deleted rather than copied into the next
configurable plugin.

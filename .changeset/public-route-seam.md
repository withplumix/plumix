---
"@plumix/core": minor
"plumix": minor
---

Adds `registerPublicRoute`, so a plugin can own a path at the site root instead of being confined
to the `/_plumix/<pluginId>/` prefix `registerRoute` mounts it under. `path` is an exact pathname
or a URLPattern pathname whose captured groups reach the handler as its third argument, and
`cacheable: true` opts the response into the edge cache on the same terms a plugin route already
gets — the URL is the whole key, freshness is the `cache-control` the handler set, and the entry
stores under whatever the handler named through `tagCacheEntry`.

Registered routes match ahead of core's own robots, sitemap and feed branches, ahead of the
redirect table and ahead of the content route map, so a plugin's route can shadow core's built-in
one outright. That is deliberate: it is what lets `/robots.txt`, the sitemap and the feeds move
into `@plumix/plugin-seo` and `@plumix/plugin-feeds` as additions rather than as simultaneous
add-and-delete releases. The handler always answers — there is no fall-through to the page that
would otherwise own the path — which is affordable because a plugin registers from the
`theme:ready` action, where every entry type and taxonomy is known, and so claims concrete paths
rather than guessing at request time. Two plugins claiming one path, or a path inside `/_plumix/`,
throws at boot naming both owners.

The canonical normalizer's exemption list now derives from that route table as well as its
hardcoded literals, so a URL that would normalize onto a registered endpoint is left alone rather
than 301'd at it — the behaviour core's hardcoded `/feed` literal gives today, kept once the
literals naming these paths are gone. The handler runs ahead of the access gate and the principal
loader, so `ctx.user` is null and a route that enumerates content is enumerating it for an
anonymous reader. Nothing changes for a site with no plugin registering a public route.

# A framework route a site turns off is never compiled

`compileRouteMap` compiled the author, date and search routes on every site
(#2816). A site with no posts still answered `/2026`, `/authors/<slug>` and
`/search` with a 200, falling through to the theme's `fallback` template, and the
empty date and author pages were indexable. The only way out was to shadow the
patterns with plugin rules that resolve nothing, which is what eduscope.uk did.

> **A site turns the author, date or search family of framework routes off
> with `routes` in `plumix()`. Each defaults to `true`. A family set to `false` is
> never compiled, not even as a redirect, so its URLs fall through to whatever
> else matches, or to 404. A date archive with no entries answers 404 whatever
> the switch says.**

## What this means

- **Keyed by page kind.** The key is `routes`, not `archives`, because search is
  a page kind but not an archive. `date` is one switch for year, month and day.
  Root pagination (`/page/N`) is the front page's and has no switch.
- **The registry carries the answer.** The app writes the resolved switch into
  the `PluginRegistry` when it creates it, before any plugin runs, and
  `compileRouteMap(registry)` reads it from there. The dispatcher's route map,
  `archiveBaseRoutes` and `archiveAtPath` all compile from the registry, so they
  agree with no signature change, and the feeds plugin registers no feed beside
  a family that is off.
- **The admin hears one boolean.** The plugin manifest carries whether author
  routes are on, so the user screen names the `/authors/` URL only where one
  exists (ADR 0014). The other families have no admin surface.
- **Empty date archives 404.** "An empty first page is in range" still holds for
  every other archive. An author is a real subject, a term is a row someone
  created and an entry type is a registration, so their empty first page is a
  true statement about something that exists. A date archive's subject is a
  number: every year ever is one, and an empty one is a thin page for any
  integer a crawler tries. Search keeps answering 200, because it reports what a
  query matched.

## Prior art

- WordPress has no core switch. Yoast and Rank Math "disable" the date and
  author archives with a 301 to the home page. WordPress core 404s an empty date
  archive, and keeps an empty author archive at 200 for a member of the site.
- Hugo (`disableKinds`), Ghost (an empty `taxonomies:` in `routes.yaml`) and
  jekyll-archives (`enabled`) all use a per-family config switch.
- Statamic and Craft create these routes only where a template exists.

## Considered options

- **Derive it from the registry** (rejected). "No listed entry type, no date
  archive" would turn the routes off on an empty site, but a blog can have posts
  and still not want date archives. The decision is the site's, not a
  consequence of what it registered.
- **Derive it from the theme** (rejected). Statamic and Craft route only where a
  template exists. Plumix themes are optional, and `fallback` renders every
  kind, so whether a theme "has a template" for a kind is blurred by design.
- **A 301 to the home page** (rejected). It is the Yoast shape, but a redirect
  still claims the URL space: a page slugged `2026` or `search` stays
  unreachable, and the redirect tells crawlers the content lives at `/`, which
  it does not. Not compiling the rule frees the URLs and answers 404 where
  nothing lives.
- **Leave it to a shadowing plugin** (rejected). It works, but every site that
  wants it writes the same do-nothing rules, and the framework rule stays
  compiled behind them for anything else that reads the route map.

## Consequences

- ADR 0002 rejected "everything in core, configurable": a site-wide toggle for a
  _feature_ core ships. This is not that. The routes stay core's, and the switch
  says which URLs core claims on a site, the same kind of decision as
  `basePath`.
- A theme template for a family that is off never renders. Core does not warn
  about it.
- With `search: false`, the `/search?q=` 301 goes with the bare `/search` rule.
  `@plumix/plugin-search` still serves `/search/:query` on its own rules.

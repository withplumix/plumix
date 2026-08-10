---
"@plumix/core": minor
---

Add a plugin/site/theme surface for public-route redirects (301/302/307/308) and `410 Gone`.

Previously the only redirect the public pipeline emitted was the dispatcher's own
canonical normalization, so a plugin could map a URL to content but never to a
redirect or a 410. Migrating an existing site (legacy `path → path` moves, or
turning a removed entry's URL into a redirect-to-successor / 410 instead of a soft
404) had to be punted to the CDN zone.

Redirects are now a first-class part of the app, contributed through whichever
surface owns the URL, all merged into one precedence-ordered set matched by the
dispatcher **ahead of the content route map** (so a redirect shadows a would-be
page):

- **Site** — `config.redirects` on the plumix config, for the site's own cutover
  list.
- **Plugin** — `ctx.registerRedirects([...])` in a plugin's setup, for
  feature-owned or data-driven redirects.
- **Theme** — a declarative `redirects: [...]` field on the theme descriptor
  (themes have no setup hook), for URL-structure moves the theme owns.

Each rule maps a `from` to a target, where `from` is a `URLPattern` string
(`/team/:slug`, `/legacy/*`; use a `RegExp` for literal paths with URLPattern
metacharacters), or a `RegExp` (with `$1` / `$<name>` backreferences interpolated
into `to`); `{ gone: true }` yields a 410. A rule may instead supply `match(url)`
for a fully dynamic decision (e.g. a DB lookup). The request query string is
carried onto the target by default (a `preserveQuery: false` per-rule flag opts
out; a target that states its own `?…` is never appended to). Precedence is
site → plugin → theme by default, and a per-rule `priority` overrides it (lower
wins).

The redirect stage runs after the reserved SEO asset routes (robots.txt,
sitemaps, feeds) but ahead of the static-asset 404 shortcut and the content route
map — so a moved image/css/js can redirect, and a redirect shadows a would-be
content page. Only `GET`/`HEAD` public requests reach it.

New public types: `RedirectRule`, `RedirectResolution`, `RedirectTarget`,
`RedirectStatus`.

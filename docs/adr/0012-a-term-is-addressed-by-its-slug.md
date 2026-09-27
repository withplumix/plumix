# A term is addressed by its slug

A term page's lookup did two jobs at once. It found the term, and it checked
that the URL was the term's canonical one. It picked which job to do from the
taxonomy's URL shape rather than from the URL being served. Where a taxonomy
exposes nested URLs, a single captured segment was read as a one-segment slug
path, so a plugin's `registerRewriteRule("/places/:term", …)` served a
top-level term and 404'd on a nested one (#2558). Each new way of addressing a
term was one more chance to break it again.

So a **term is addressed by its slug**. `terms_taxonomy_slug_idx` is unique on
`(taxonomy, slug)`, which means a slug names exactly one term. The ancestor
segments of a nested URL carry nothing that identifies it. Checking them can
reject a URL, but it can never tell two terms apart. Term resolution takes the
last segment of whatever the route captured (`:path+` or `:term`) and does one
indexed lookup. It consults neither the taxonomy's URL shape nor the route
table. `EntryQuery.inTerm` takes a slug or a slug path and records the slug, so
a term page and its listing still share one memoized lookup.

The ancestor path is **canonical decoration**, and canonicality is decided
apart from identity:

- **Core's routes canonicalise.** When a rule core compiled from a
  registration's permalink configuration matches, and the term's canonical URL
  differs from the request path, the resolver answers `301` to the canonical
  URL. The page number, query string and base path carry over, and the redirect
  goes out before anything renders. `/region/france` and `/region/asia/france`
  both land on `/region/europe/france`.
- **A plugin's rule is its own canon.** A rule registered through
  `registerRewriteRule` serves at the URL it matched and never redirects,
  because the plugin chose that shape deliberately. `RouteRule` carries
  `isPermalinkRoute` to tell the two apart. `registeredBy` cannot, since auto
  rules set it too, and neither can `priority`, since a plugin may pick any.

The capture core compiles is unchanged: `:path+` where a taxonomy exposes
nested URLs, `:term` where they are flat. `exposesHierarchicalUrls` still
chooses it and still shapes outbound URLs. The lookup just stops asking it.

## Prior art

- **WordPress** picks the capture from the taxonomy's shape as core does
  (`WP_Taxonomy::add_rewrite_rules`: `(.+?)` when hierarchical, `([^/]+)`
  otherwise). At resolution it then throws the ancestors away:
  `WP_Query::parse_tax_query` takes `wp_basename()` of a hierarchically
  rewritten term query var and queries by `'field' => 'slug'`. Canonicality is
  `redirect_canonical()`'s job alone. The asymmetry is deliberate.
  `get_page_by_path` does verify the whole chain, because WordPress allows the
  same `post_name` under different parents, so a page path is load-bearing for
  identity where a term path is not.
- **EmDash** has no rewrite layer (Astro file routing), and its lookup
  primitive is `getTerm(taxonomy, slug)`. A nested term is addressed by its
  slug alone.

## Considered options

- **The capture decides** (rejected). `:term` would mean by slug and `:path+`
  would mean by slug path. That fixes the reported rule but keeps a lookup
  whose answer depends on how the URL was spelled, and it needs a second public
  form of `inTerm` to keep the page and listing on one lookup.
- **The URL shape decides, and the docs forbid a mismatched capture**
  (rejected). This documents the bug instead of fixing it. It also makes a
  plugin's rule shape a constraint core would have to police.

## Consequences

- A wrong-ancestor path on a core term route now 301s where it used to 404, and
  a term below a renamed parent still answers at its old URL.
- `findTermByPath` is removed from `plumix/plugin`. It had no caller left.
- Entries keep full-chain matching. `entries_type_slug_idx` makes the same
  argument available, but an entry path also carries draft and preview-token
  visibility, and nothing there is broken.

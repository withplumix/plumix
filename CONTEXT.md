# Plumix

Plumix is a WordPress- and Astro-lineage CMS platform: authored content is
classified by taxonomies, composed from blocks, gated by access policy, and
rendered by a theme's templates into mostly-static pages with selective client
islands. The whole platform is **one bounded context** — the vocabulary below
has one meaning across every package (`core`, `blocks`, `plumix`, `admin*`).
Project scaffolding (`create-plumix-app`) is a separate, not-yet-modelled
context where a few words (notably _template_) mean something different.

This file is a glossary and nothing else — no implementation details, no
decisions. Architectural decisions live in `docs/adr/`.

## Content

**Entry**:
The single stored unit of authored content — one row bearing a `type`, title, slug, content, status, author, and meta.
_Avoid_: post, node, live row

**Entry type**:
A registered kind of entry (`post`, `page`, …) declaring its labels, supported features, taxonomies, hierarchy, and archive rules.
_Avoid_: post type, content type

**Post**:
The standard non-hierarchical blog entry type. A specific entry type, not a base concept — "post" is never the word for entry-in-general.

**Page**:
The hierarchical static entry type rooted at `/`, with no archive.

**Term**:
A single classification value inside a taxonomy (one category, one tag).

**Taxonomy**:
The named grouping a term belongs to (`category`, `tag`, …), scoped to entry types.
_Avoid_: termTaxonomy (that is the code identifier; the domain word is taxonomy)

**Slug**:
The URL-safe identifier of an entry (unique per type) or term (unique per taxonomy).

**Status**:
An entry's publication state: `draft`, `published`, `scheduled`, or `trash`.

**Meta**:
The per-entity JSON bag of custom fields backing meta-box fields. The `__plumix_*` key prefix is framework-reserved and off-limits to authors.
_Avoid_: custom fields (as the storage; "meta-box field" is the declared field)

**Permalink**:
The public canonical URL of an entry or term archive.

**Supports**:
The feature list an entry type opts into (`title`, `editor`, `excerpt`, `slug`, `revisions`, `autosave`).

## Fields & settings

**Meta box**:
A registered card of fields shown on an editor form (entry, term, or user) — both a storage unit and a visual unit. Declaring a meta box is the only way to register a meta key; there is no separate `registerMeta` step.

**Meta-box field**:
A single declared custom-content field — the one source of truth for both the admin input UI and the server-side storage/validation contract.
_Avoid_: custom field. Bare "field" is overloaded (block inputs, settings); prefer "meta-box field" when precision matters.

**Field type**:
The concrete kind of a meta-box field (`text`, `number`, `richtext`, `select`, `repeater`, `reference`, …), discriminated by its input type.

**Reference field**:
A meta-box field whose value is a foreign id (or list) into another entity — user, entry, term, or media — resolved at read time.

**Repeater**:
A meta-box field holding a list of structured rows that share one fixed subfield schema.

**Setting**:
One stored key/value pair within a settings group.

**Settings group**:
A self-contained, independently-saved card of fields — same field shape as a meta box, but for site configuration rather than content.

**Settings page**:
A pure-UI composition of settings groups rendered at a settings route; not itself stored.

## Revisions

**Revision**:
An immutable historical snapshot of an entry, stored as a reserved-type row keyed by an encoded slug.
_Avoid_: use "revision" for the stored row and "snapshot" only for the act of capturing one — do not use them interchangeably.

**Autosave**:
A per-user pending draft of edits to a published entry — one per entry-and-author.

**Snapshot**:
The act of capturing an entry's current state into a revision. Not the row itself (that is the revision).

## Blocks & rich content

**Block**:
A named, registered content component. The registered _definition_ is the block spec; a single stored instance in an entry's content tree is a block node — keep the two senses distinct.
_Avoid_: Gutenberg, Builder.io (these are the reference models, not plumix terms)

**Block input**:
A single editable control declared on a block — an attribute, a style-bound property, or a child slot.

**Variation**:
A preset of a block (attributes plus optional child body) surfaced in the inserter.

**Pattern**:
A named, reusable prebuilt tree of blocks, inserted by copy or by reference.

**Mark**:
An inline rich-text formatter (`bold`, `italic`, `link`, …) — the inline sibling of a block.

**Shortcode**:
A named text macro authors type into content (`[year]`), expanded to a string at render time.

**Entry content**:
The rich-text document persisted on an entry, allow-listed by the renderer on the way out.

**Island**:
A client-interactive component embedded in otherwise-static server-rendered HTML. A page with no island ships zero JavaScript.

**Hydration**:
Attaching client React to an island's server markup.

**Hydration strategy**:
When an island hydrates: `load`, `idle`, `visible`, `interaction`, or `only`.

## Themes & templates

**Theme**:
The site-specific presentation layer, defined statically (no setup hook): templates, owned blocks and shortcodes, design tokens, and a document manifest.

**Template**:
A theme render unit bound to a route or data kind. See the disambiguation note — distinct from a stored page-template choice.

**Template data**:
The discriminated union of data shapes a template can receive, keyed by kind (`entry`, `archive`, `taxonomy`, `author`, `date`, `frontPage`, `search`, `error`, `custom`).

**Generic tier**:
The fixed set of catch-all template slots a theme declares (`fallback`, `entry`, `archive`, `taxonomy`, `author`, `date`, `frontPage`, `search`, `notFound`, `serverError`).

**Target matcher**:
A targeted template rule that binds a template to a specific node (by kind, type, and slug/id/predicate), taking precedence over the generic tier.

**Archive**:
A paginated listing view of many entries of one type.

**Template dep**:
A named per-request data dependency a template declares and the framework loads (e.g. `menu`, `settings`).

**Token**:
A named design value a theme declares, emitted as a CSS custom property.

## Access & identity

**Principal**:
The actor a request resolves to — a loaded user, or the anonymous absence of one — against whom access is decided.
_Avoid_: visitor, actor, audience

**User**:
A person with a persisted account row (email, slug, role, meta). The request-time projection carried on context is the authenticated user; the full row is the user.

**Role**:
A user's fixed tier on the ordered ladder `subscriber < contributor < author < editor < admin`, where higher tiers inherit lower capabilities.

**Capability**:
A named permission string (`<entity>:<type>:<action>`) mapped to a minimum role. See the disambiguation note — distinct from an entitlement label.
_Avoid_: permission, cap

**Session**:
A server-issued, cookie-carried credential binding a browser to a user.

**hasSession**:
The predicate answering whether a request carries a browser-session credential (as opposed to a bearer token).
_Avoid_: carriesSession (not a real term — the predicate is `hasSession` / `requestHasSession`)

**Authenticator**:
A pluggable strategy that maps a request to who the user is. Read-only — it resolves credentials, it never mints sessions.
_Avoid_: guard

**API token**:
A bearer credential for non-browser clients, carrying its own scopes.
_Avoid_: PAT, personal access token, bearer token

**Access policy**:
A developer-supplied rule pairing an arbitrary resolve step with a closed, declarable set of audience segments.

**Segment**:
The audience label a resolved access is tagged with — built-in (`anonymous`, `authenticated`, `private`, `role:<role>`), an `entitlement:<label>`, or a custom label. Doubles as the shared-cache variant key.
_Avoid_: audience, variant, cache key

**Gate**:
The closed enforcement verdict a policy yields for a principal: `allow`, `redirect`, or `challenge`.

**Entitlement**:
A developer-defined membership, plan, or tier a principal is granted via an external check, expressed as the `entitlement:<label>` segment family.
_Avoid_: membership, plan, tier — and never "capability" (that is the RBAC sense)

**Challenge**:
An unmet-requirement outcome — _hard_ (terminal 402/403, no content) or _soft_ (a 200 teaser variant).

**Teaser**:
The public, principal-invariant preview a soft challenge serves in place of the gated body.

**Paywall**:
The membership-gating scenario a challenge implements. A scenario label, not a type — the mechanics are challenge plus entitlement.

## Runtime & rendering

**Route intent**:
What a matched URL represents — `single`, `archive`, `taxonomy`, `author`, `date`, `front-page`, `search`, or `custom`.

**Edit mode**:
The render mode a request resolves to — `live`, `preview`, or `edit`.

**Preview grant**:
A valid preview token granting draft visibility for one entry, forcing a cache bypass.

**Admin bar**:
The zero-JS, server-rendered admin chrome overlaid on public pages for logged-in users.

## Extensibility

**Plugin**:
A unit of extension defined by a plugin descriptor, which registers its contributions during setup.

**Hook**:
The umbrella term for the two extension primitives, filter and action.

**Filter**:
A hook whose handlers form a pipeline — each receives the previous handler's return value and returns a possibly-transformed value. (WordPress lineage.)

**Action**:
A hook whose handlers fire for side effects and return nothing.

**Plugin manifest**:
The wire-shipped projection of the plugin registry that the admin bundle consumes. See the disambiguation note — always qualify "manifest".
_Avoid_: bare "manifest"

**Document manifest**:
The declarative `<head>`/`<html>` descriptor (title, meta, link, script tags) a theme or template contributes to the rendered document.

## Caching

**Edge cache**:
The shared-document cache for anonymous public renders, served read-through: a hit returns the stored response; a miss renders live and stores without blocking the response.

**Cache tag**:
A coarse label a stored page carries for invalidation — a type tag (`t:<type>`) or an entry tag (`e:<id>`).

**Purge**:
Invalidation of stored responses by tag.
_Avoid_: bust, invalidate

## SEO

**Canonical URL**:
The single normalized source-of-truth URL driving `<link rel="canonical">`, the redirect normalizer, sitemap, and `og:url`.

**Sitemap**:
The generated XML URL set, paged into scoped sub-sitemaps per entry type, taxonomy, or custom archive.

**Feed**:
The recent-items syndication output (RSS/Atom).

## Disambiguation — one word, several meanings

These words each carry more than one meaning in the code. The glossary keeps
them distinct by **always qualifying** them; bare use is a smell.

- **manifest** — always qualify: **plugin manifest** (registry projection for
  admin), **document manifest** (`<head>` descriptor), **asset manifest** (Vite
  chunk map), **island runtime manifest** (bootstrap). Never write bare
  "manifest".
- **capability** — the **RBAC** sense (a permission string) vs the loose
  entitlement-label sense. Reserve "capability" for RBAC; use **entitlement**
  for the membership label.
- **template** — the **theme render unit** (this glossary) vs the stored
  **page-template** choice an entry can pick vs the **project template** in the
  scaffolder. Qualify when both are in play.
- **entry vs post** — the canonical noun is **entry**. "post" is a specific
  entry type only; storage defaults and permalink helpers still say "post" but
  that is drift, not the domain word.

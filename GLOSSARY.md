# Plumix

Plumix is a WordPress- and Astro-lineage CMS platform: authored content is
classified by taxonomies, composed from blocks, gated by access policy, and
rendered by a theme's templates into mostly-static pages with selective client
islands. The whole platform is **one bounded context** — the vocabulary below
has one meaning across every package (`core`, `plumix`, `admin*`, the plugins and the runtimes).
Project scaffolding (`create-plumix-app`) is a separate context, not modelled
here, where a few words (notably _template_) mean something different.

This file is a glossary and nothing else — no implementation details, no
decisions. Architectural decisions live in `docs/adr/`. It holds the vocabulary of
Plumix as designed, the same design `ARCHITECTURE.md` draws.

## People

**Developer**:
Builds the site in code, deploys it and runs the CLI. A kind of user, not a role.

**Member**:
A signed-in user who holds the `member` role, the default role with the fewest capabilities.
_Avoid_: subscriber

**Editor**:
A person who writes, edits and publishes content in the admin. Usually holds the `author` or `editor` role; the role and the person share the word, and the visual editor is the tool.

**Staff**:
Anyone who may open the admin, which means holding the `admin:access` capability.

**In-editor agent**:
An agent the admin runs for the editor who asks, drafting pages through the same procedures as the editor and reaching a model through the `llm` config slot.

**Site admin**:
A person who manages users and settings, usually holding the `admin` role.

**Designer**:
A person who composes pages in the visual editor from blocks and design tokens. A kind of user, not a role.

**Visitor**:
An anonymous reader of the public site. A kind of person; where access is decided, say principal.

**Agent**:
An AI client that works in a running site over MCP with an API token, held to that token's capabilities, edit leases, revisions, the allowed blocks and the style policy.

**API client**:
Software that reads published content over REST with an API token.

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

**Translation**:
An entry's version in one enabled locale. The public site, the admin and the APIs serve each one.
_Avoid_: localization, i18n (those name translating the UI strings, not entry content)

**Term**:
A single classification value inside a taxonomy (one category, one tag).

**Taxonomy**:
The named grouping a term belongs to (`category`, `tag`, …), scoped to entry types.
_Avoid_: termTaxonomy (that is the code identifier; the domain word is taxonomy)

**Collection**:
The plural name by which the REST API addresses a public entry type or taxonomy (`posts`, `categories`).
_Avoid_: rest_base, type (for the URL segment)

**Slug**:
The URL-safe identifier of an entry (unique per type) or term (unique per taxonomy).
A term is addressed by its slug alone; the ancestors in a nested term URL are
canonical decoration, not part of its address (ADR 0012).

**Status**:
An entry's publication state: `draft`, `published`, `scheduled`, or `trash`.

**Meta**:
The per-entity JSON bag of custom fields backing meta-box fields. The `__plumix_*` key prefix is framework-reserved and off-limits to authors.
_Avoid_: custom fields (as the storage; "meta-box field" is the declared field)

**Stored meta**:
A meta bag as the row holds it — what a `WHERE` over the JSON column, a raw row
off a lifecycle event, and a rule selector all read without decoding.

**Resolved meta**:
The same bag as a read surface hands it back, each value read against its
meta-box field and every reference id hydrated. The counterpart to stored meta;
the two are meant to answer the same question the same way.

**Entry query**:
A description of a set of entries, built up by narrowing rather than written as
SQL. A surface hands one out already restricted to what that surface may show —
every archive's and every feed's is born holding only public entries — and
whoever receives it can add conditions but never drop the ones already on it.

**Public entries**:
Published entries of public types: what an anonymous reader may be shown. The
set every archive and every feed starts from, whoever is looking — an editor
previews in the editor, not on an archive page.
_Avoid_: readable entries (that is the viewer's set, which varies per user)

**Permalink**:
The public canonical URL of an entry or term archive.

**Supports**:
The feature list an entry type opts into (`title`, `editor`, `excerpt`, `slug`, `revisions`, `autosave`).

**Entry change feed**:
Core's durable record of which entries changed, appended by triggers on the
`entries` table rather than by application code, so a seed, a migration or a
direct write cannot bypass it. A consumer drains it and acknowledges what it
handled. Core's, not a plugin's, because drizzle rebuilds the table for ordinary
schema changes and every trigger on it dies at the `DROP`.

## Fields & settings

**Meta box**:
A registered card of fields shown on an editor form (entry, term, or user) — both a storage unit and a visual unit. Declaring a meta box is the only way to register a meta key; there is no separate `registerMeta` step.

**Meta-box field**:
A single declared custom-content field — the one source of truth for both the admin input UI and the server-side storage/validation contract.
_Avoid_: custom field. Bare "field" is overloaded (block inputs, settings); prefer "meta-box field" when precision matters.

**Field type**:
The concrete kind of a meta-box field (`text`, `number`, `richtext`, `select`, `repeater`, `reference`, …), discriminated by its input type.

**Settled value**:
A stored value already in the form its meta-box field's declared type implies.
Everything written through the field pipeline is settled: the pipeline accepts
the looser forms a form post or a direct caller may send and settles them on the
way in.

**Unsettled value**:
A stored value that is not in that form — left by an import, a direct database
write, or a row persisted before a plugin tightened the field. A valid state,
not a corrupt one: a declared type is a contract on what the pipeline accepts
and returns, not an invariant the column enforces. Readers answer from the value
as stored, so an unsettled value reads as unrecognized rather than as the value
it resembles.

**Reference field**:
A meta-box field whose value is a foreign id (or list) into another entity — user, entry, term, or media — resolved at read time.

**Composite field**:
A meta-box field whose value is assembled from declared sub-fields rather than stored directly — a group or a repeater. The two share one write path: each sub-field is settled on its own, an all-blank value is treated as an authoring affordance and dropped, and the field's own checks run last, over the assembled result.
_Avoid_: structural field — that is the wider roster family, which also holds rich text and link.

**Group**:
A composite field holding one keyed object of members, stored nested under the group's own key. Members are addressed by name, never flattened into the surrounding bag.

**Repeater**:
A composite field holding a list of structured rows that share one fixed subfield schema.

**Field default**:
The value a meta-box field starts with on a new entity. It is written into the entity's meta when the entity is created, so from then on storage alone holds the field's value. It is not a fallback: once an author clears the field, the field stays empty. Whether a field may be empty is decided by _required_, not by having a default.
_Avoid_: fallback value

**Image role**:
A named purpose an entry, term or user scope assigns to one of its media reference fields, so a reader asks for "the entry's featured image" rather than for a meta key. Core ships `featured` and `ogImage`; a plugin or theme declares any other. Each role declares whether a scope may carry more than one field in it. A role field may sit inside a group, never inside a repeater: a role names the entry's image, not a row's.
_Avoid_: role (bare — that is the user's role), featured field (a featured field is one image role, not the concept)

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

## Concurrent editing

**Copy**:
What a writer loaded and is editing: an entry, term, settings group or user as it stood when read. A write made from a copy must say which state it was taken from.

**Concurrency token**:
The opaque value that names the state a copy was taken from, called `etag` in every API and sent back as `ifMatch`. Every write to the resource moves it forward; a write carrying one that is no longer current is a conflict.
_Avoid_: version, edit token, revision (a revision is a stored snapshot), timestamp (what it is made of is not the contract).

**Conflict**:
A write refused because its copy is out of date or its token is missing. It reports when the resource changed; who is editing it comes from the edit lease. Never resolved on the user's behalf.

**System write**:
A write not made from a copy (scheduled publishing, bulk actions, trash and restore, import, sync). It moves the concurrency token without checking it, and ignores edit leases.

**Edit lease**:
One user's claim to edit a resource, renewed while they edit and lapsing when they stop. While it holds, anyone else's write is refused with `LOCKED` unless they take it over.
_Avoid_: lock (reserved for database locks), presence (a lease prevents, it does not decorate).

**Take over**:
Claiming an edit lease another user holds. The previous holder turns read-only and keeps their unsaved work. Only a person takes over; an agent waits. A user saving their own account through the auth client always takes over (ADR 0050).

**Keep mine**:
Answering a conflict by saving the author's refused work over what is saved now, as an explicit overwrite from the concurrency token the conflict reported.

**Load theirs**:
Answering a conflict by discarding the author's refused work and reloading what is saved now.

## Blocks & rich content

**Block**:
A named, registered content component. The registered _definition_ is the block spec; a single stored instance in an entry's content tree is a block node — keep the two senses distinct.
_Avoid_: Gutenberg, Builder.io (these are the reference models, not plumix terms)

**Block input**:
A single editable control declared on a block — an attribute, a style-bound property, or a slot input.

**Content input**:
A block input marked `content: true`: the text, link or media a writer without the layout capability may still change. Every other input is layout, and a slot or style-bound input always is.

**Layout capability**:
`entry:<type>:edit_layout`, which lets a writer change an entry's layout as well as its content: add, remove, move or rename a block node, and change its style, visibility, HTML attributes, class name, tag name or any input that isn't a content input. Authors, editors and admins hold it by default. The editor and the server both enforce it; the server refuses a layout change with a `layout_change` issue.
_Avoid_: design permission, structure permission

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

**Extractor version**:
A tag derived by hashing the merged roster of every block's text declaration,
plus the extraction algorithm. It changes when any declaration does, so a
document stamped by an older roster is distinguishable from a current one — no
version integer for a block author to keep true. The index rebuild sweeps the stale
ones.

**Allowed blocks**:
The blocks a theme lets the editor offer and any writer save, from its `allowedBlocks` list: every registered block when it names none. An entry that already holds a block outside them keeps and renders it; a save cannot add a new one.

**Style policy**:
A theme's rule for style values, from its `allowCustomStyles`: custom values allowed (`true`, the default), design tokens only (`false`), or tokens only except the style categories it lists. Keyword options are never custom values. The editor and the server both enforce it; a value an entry already stores is kept, and a save cannot add a new one.

## Themes & templates

**Theme**:
The site-specific presentation layer, defined statically (no lifecycle step): templates, owned blocks and shortcodes, design tokens, and a document manifest.

**Template**:
A theme render unit bound to a route or data kind. See the disambiguation note — distinct from a stored page-template choice.

**Page kind**:
What a public page is about, named by its subject: `entry`, `entryType`, `term`, `author`, `date`, `archiveType`, `view`, `frontPage` or `search`.
_Avoid_: single, content, content-type-archive, taxonomy (for a term's page), custom, front-page

**Template data**:
The discriminated union of data shapes a template can receive, keyed by page kind (`entry`, `entryType`, `term`, `author`, `date`, `archiveType`, `view`, `frontPage`, `search`) plus `error`.

**Generic tier**:
The fixed set of catch-all template slots a theme declares: one per page kind (`entry`, `entryType`, `term`, `author`, `date`, `frontPage`, `search`) except `archiveType` and `view`, plus `fallback`, `notFound` and `serverError`.

**Target matcher**:
A targeted template rule that binds a template to a specific node (by kind, type, and slug/id/predicate), taking precedence over the generic tier.

**Archive**:
A public page listing many entries, described by one entry query — the front
page, an entry type, a term, an author, a date, or one a plugin registers. Its
listing and its feed read that same query, so the two cannot disagree about
what the archive contains.

**Archive type**:
An archive a plugin registers with `registerArchiveType`, which core routes and
templates by name without knowing what it lists.

**View**:
A per-visitor app page a plugin registers with `registerView`, such as a sign-in
form, an account page or a shared comparison. It renders through the theme like
any page but lists nothing, so it is not an archive. It is never stored by the
CDN unless it opts in, and claims no automatic canonical link. See ADR 0035.
_Avoid_: unlisted archive (for a per-visitor page), app route

**Listing**:
One page of an archive's entries: its entry query run by core, paged, and
handed to the theme as resolved entries with their pagination.

**Template dep**:
A named per-request data dependency a template or a block declares and the framework loads once for the page (e.g. `menu`, `settings`).

**Design token**:
A named design value a theme declares, emitted as a CSS custom property.
_Avoid_: bare token (an API token, a concurrency token)

**Transition type**:
A name core adds to a navigation's view transition (`nav-forward`, `nav-back`, `nav-replace`)
for theme and admin CSS to match.

## Access & identity

**Principal**:
The actor a request resolves to — a loaded user, or the anonymous absence of one — against whom access is decided.
_Avoid_: visitor, actor, audience

**User**:
A person with a persisted account row (email, slug, role, meta). The request-time projection carried on context is the authenticated user; the full row is the user.

**Role**:
A named set of capabilities, declared in the site's config under `roles` (ADR 0055). The defaults are `member`, `author`, `editor` and `admin`; a site redefines all but `admin` and defines more. `admin` always holds every capability. Roles are never ranked or compared.
_Avoid_: tier, level

**Capability**:
A named permission string a role grants: `<entity>:<type>:<action>` for an entry or term type, `<area>:<action>` otherwise (`user:list`, `admin:access`). Opening the admin and reading gated content each require one. A plugin names an entry or term capability by resource type and action, and the registry spells the string. See the disambiguation note — distinct from an entitlement label.
_Avoid_: permission, cap

**Session**:
A credential binding a browser to a user: Plumix's own session cookie, or an identity provider's assertion such as Cloudflare Access.

**hasSession**:
The predicate answering whether a request carries a browser-session credential (as opposed to a bearer token).
_Avoid_: carriesSession (not a real term — the predicate is `hasSession` / `requestHasSession`)

**Sign-in method**:
A way a person proves who they are and gets a session, such as a passkey, a magic link or OAuth. Core and plugins declare one with `defineAuthMethod`; its routes answer under `/_plumix/auth/<name>/`, and core's kernel mints the session. Distinct from an authenticator, which only reads one.
_Avoid_: auth provider, login method

**Auth client**:
The browser-side API a theme imports from `plumix/auth/client`: signing in and out, the session, and the signed-in user's own account (profile, email, locale, sessions, passkeys, linked OAuth accounts, a capability check). Every call acts on the session's user and resolves `{ data, error }`. See ADR 0050.

**Authenticator**:
A pluggable strategy that maps a request to who the user is. Read-only — it resolves credentials, it never mints sessions.
_Avoid_: guard

**API token**:
A credential for non-browser clients, whose scopes are capabilities, intersected with its owner's.
_Avoid_: PAT, personal access token, bearer token

**Token audience**:
The one URL an API token is bound to, such as the site's MCP endpoint; only that surface accepts the token. A token without one works on every surface that takes API tokens.
_Avoid_: bare audience (a segment's label)

**OAuth client**:
An MCP client that connects to a site through OAuth, identified by the URL of its Client ID Metadata Document. The document must name that URL as its `client_id` and lists the redirect URIs the client may receive codes at. Distinct from the OAuth providers (`github()`, `google()`) a person signs in with.
_Avoid_: app, registered client

**Access policy**:
A developer-supplied rule pairing an arbitrary resolve step with a closed, declarable set of audience segments.

**Segment**:
The audience label a resolved access is tagged with — built-in (`anonymous`, `authenticated`, `private`, `capability:<name>`), an `entitlement:<label>`, or a custom label. Doubles as the shared-CDN key.
_Avoid_: audience, variant, cache key

**Gate**:
The closed enforcement verdict a policy yields for a principal: `allow`, `redirect`, or `challenge`.

**Entitlement**:
A developer-defined membership, plan, or tier a principal is granted via an external check, expressed as the `entitlement:<label>` segment family.
_Avoid_: membership, plan, tier — and never "capability" (that is the RBAC sense)

**Challenge**:
An unmet-requirement outcome — _hard_ (terminal 402/403, no content) or _soft_ (a 200 teaser render).

**Teaser**:
The public preview a soft challenge serves in place of the gated body. Shared per segment like any other render, so one that reads the principal is a personal render.

**Paywall**:
The membership-gating scenario a challenge implements. A scenario label, not a type — the mechanics are challenge plus entitlement.

## Runtime & rendering

**Route intent**:
What a matched URL represents, named by its page kind — `entry`, `entryType`, `term`, `author`, `date`, `frontPage`, `search`, `archiveType` or `view`.

**Framework route**:
A route core compiles without any registration: root pagination (`/page/N`) and the author, date and search routes. A site turns the author, date or search family off with `routes` in `plumix()`, and a family that is off is never compiled. See ADR 0029.

**Resolved route**:
The content route the current public request matched — the pattern as it was declared and the params it captured — read from `ctx.resolvedRoute` by anything rendering the page that has to address the page's own URL space. `null` on every path the content router did not match.

**Page outcome**:
A 404 or a redirect that a page step throws to end the request instead of rendering: `pageNotFound()` or `redirectTo(location, status?)` from `plumix/support`. The page steps are an archive type's or a view's `resolve`, a template dep, a block loader on the page's own content and the template's `document()`. See ADR 0032.

**Public route**:
A path a plugin owns at the site root, registered with `registerPublicRoute` and answered by its own route handler ahead of core's endpoints, the redirect table and the content route map. Distinct from a plugin route, which `registerRoute` confines to `/_plumix/<pluginId>/`.

**Runtime adapter**:
The code that adapts one platform's serve API to core, by building the runtime handler and generating the entry module the platform runs — a Workers default export, a `Bun.serve` call, a `node:http` bridge. The engine underneath (Workers, Node, Bun, Deno) is _the runtime_; the adapter is what bridges to it.
_Avoid_: platform adapter, driver

**Runtime handler**:
The platform-neutral object a runtime adapter produces — a `fetch`, optionally a `scheduled` and a `dispose`. See the disambiguation note — distinct from a route handler and an event or filter handler.

**Invocation**:
What a runtime adapter hands core for one call into the runtime handler: the `env`, an optional `waitUntil`, an optional client address.

**Catalog locale**:
The locale whose catalog serves an enabled locale, picked from the locales a catalog set ships by one rule: the exact tag, then its CLDR parent or the tag less its last subtag, repeatedly and never across a script, then the source locale. `de` is the catalog locale of `de-AT` when Plumix ships `de` and not `de-AT`; `zh-TW` reads the English source rather than `zh-CN`. See ADR 0054.
_Avoid_: fallback locale (Lingui's name for a per-message fill, not for the catalog chosen)

**Migration history**:
The ordered migrations that build the tables one owner declares — core, a plugin, or a site's own tables — shipped and committed with that owner and replayed by every database it reaches. Source its owner alone writes: it only grows, and nothing that applies it ever deletes or rewrites it. A site's database is built from every history its config pulls in, each migration applied once: owner by owner (core, then plugins in config order, then the site), each history in its own order.
_Avoid_: migrations folder, `drizzle/` (a folder holds a history; it is not the concept)

**Data migration**:
A named, forward-only TypeScript step that reshapes data an owner already stored (renames a settings key, rewrites JSON meta, backfills a value), declared with `defineDataMigration` by core, a plugin (with or without tables) or the site. Every owner's data migrations run after every migration history, wherever those apply: core's, then plugins' in config order, then the site's, each list in its own order. Each is recorded once its `up` succeeds, by owner and name, and never runs again; a mistake is fixed by a new one, never by a `down`.
_Avoid_: seed, data patch, `post_update` (a seed fills an empty database; a data migration reshapes one that has data)

**Sync**:
Replacing one environment's data with the other's, one sync scope at a time, through `plumix sync pull` or `push`. A sync replaces whole tables with the source's rows under their own ids and never merges. See ADR 0039.
_Avoid_: import, migration (a migration reshapes a database's schema or data in place; a sync copies data between two databases)

**Sync scope**:
A named set of whole tables a sync replaces: `content`, `users`, `plugin:<id>`, or `media`, which is the storage slot's objects. Auth state is in none.

**Sync dump**:
What a sync moves from the source to the target: a versioned `manifest.json`, one NDJSON file per table, the authors its rows reference, and the media objects. It is a directory between two ends on disk, and one NDJSON stream with the same sections over a site's sync routes.

**Config slot**:
A named key of the `plumix()` call in `plumix.config.ts`. Slots are siblings rather than a bundle, though one may still require another's platform: a slot naming a Cloudflare binding needs the Cloudflare runtime beside it. See the disambiguation note — distinct from a descriptor slot, a slot input and a template slot. Read at runtime as `ctx.config.<slot>`. A slot that binds to the platform is also connected as a service on the context (`ctx.storage`).

**Infrastructure slot**:
A config slot that holds an adapter the admin could offer an action for: `storage`, `imageDelivery`, `kv`, `cdn`, `mailer`. Not a capability: it says what the deployment can do, not what a user may. See ADR 0014.

**Configured slot**:
An infrastructure slot the site's resolved config sets. The plugin manifest carries only whether each one is configured; an admin affordance backed by one is hidden when it isn't. Not a capability. See ADR 0014.

**Refused admin area**:
An admin area a runtime adapter refuses for every visitor, named by what its actions would produce: `apiTokens`, `deviceAuthorization`, `passkeys`, `oauthLinking`, `emailDelivery`. The plugin manifest carries the list, and the admin hides every surface of a refused area; the runtime's own routing still refuses the requests. Not a capability. See ADR 0014.

**Client address**:
The network address a request came from, as the runtime's trusted proxy reported it and the runtime adapter handed core. Advisory: it describes the network path, never the principal, so no access decision reads it.
_Avoid_: IP, client IP, remote address

**Edit mode**:
The render mode a request resolves to — `live`, `preview`, or `edit`.

**Preview grant**:
A valid preview token granting draft visibility for one entry, forcing a CDN bypass.

**Admin bar**:
The zero-JS, server-rendered admin chrome overlaid on public pages for logged-in users.

**Admin bar node**:
One item of the admin bar, registered by core or a plugin in `setup` with `registerAdminBarNode`. A node left out for a request takes its children with it.

**Wire module**:
The browser-side counterpart of a public JSON route: it owns the route's path, the deployment's base path and the decoding of the answer, so a theme never builds the URL or trusts the payload. Internal to its package; the published surface is a React hook.
_Avoid_: browser adapter, client adapter (_adapter_ means **runtime adapter**)

**Scheduled task**:
Work core or a plugin registers on a cron, fired by the scheduler: the platform's cron, an in-process timer or `plumix cron run`.

**Run guard**:
The claim that lets one replica run a scheduled firing when several fire it.

**Telemetry consumer**:
What the `telemetry` config slot sends request traces to; core's OTLP consumer exports them, and optionally their span logs, to any OpenTelemetry endpoint.

**Telemetry snapshot**:
Everything recorded about one request or scheduled run (its spans, records and the deferred work it started), handed to every telemetry consumer once that work has settled.
_Avoid_: trace, snapshot alone.

**Span**:
One timed, named step inside a telemetry snapshot, with its outcome and the spans and span logs beneath it.

**Span log**:
A log line written while a span is current, kept on that span.
_Avoid_: span event.

**Deferred work**:
Work a request or scheduled run starts but does not wait for before it answers. It still belongs to that request's telemetry snapshot.
_Avoid_: background job.

**Job queue**:
The runtime's own queue behind the `queue` config slot, for work that outlives a request, such as webhook deliveries.

**Webhook**:
A URL, headers, events and payload an entry type declares in code. When one of its events fires, core POSTs the payload with those headers through the job queue.

**Settle**:
What a sync target runs after a sync lands: the `sync.after` handlers and a whole-CDN purge.

**Origin cache**:
A runtime's own response cache that the CDN read-through stores shared renders in. A server runtime has none.

**Published surface**:
Every export a consumer can import: `plumix` and its subpaths (the umbrella), plus each plugin's and runtime adapter's exports.
_Avoid_: façade (for the whole surface)

## Extensibility

**Plugin**:
A unit of extension defined by a plugin descriptor, which registers its contributions during setup. A plugin may be local to a single site or published for others to install; distribution is a mode, not a kind.

**Plugin state**:
What one install of a plugin keeps in memory for its own code. Rebuilt from code on every boot, never stored, never seen by other plugins. See ADR 0058.
_Avoid_: registry, store

**Lifecycle step**:
One of the functions a plugin descriptor gives core to run, in a fixed order, when the plugin is installed: `state`, `provides`, `setup`, `afterSetup`.
_Avoid_: hook, descriptor callback

**Event**:
A named extension point announcing something that already happened. Its handlers react to it and cannot change the outcome.
_Avoid_: action, hook

**Filter**:
A named extension point whose handlers form a pipeline — each receives the previous handler's return value and returns a possibly-transformed value. (WordPress lineage.)
_Avoid_: hook

**Narrowing composition**:
The rule that makes an extension point safe to hand a query to: a contribution
can only be joined by AND to what it received, so a plugin can restrict what a surface
shows and has no way to widen it. What the extension forgets to say cannot
become a leak.

**Plugin manifest**:
The wire-shipped projection of the plugin registry that the admin bundle consumes. See the disambiguation note — always qualify "manifest".
_Avoid_: bare "manifest"

**Document manifest**:
The declarative `<head>`/`<html>` descriptor (title, meta, link, script tags) a theme or template contributes to the rendered document.

**Mail**:
A message core or a plugin declares by name with `defineMail`, typed by the props it renders from, and sends with `ctx.mail.send`. It renders in its recipient's locale, and a site or a theme overrides its subject, text or HTML by name. Distinct from the mailer, the infrastructure slot that delivers what a mail renders. See ADR 0036.
_Avoid_: email template, notification

## Caching

**CDN**:
The shared-document cache for anonymous public renders, served read-through: a hit returns the stored response; a miss renders live and stores without blocking the response.

**Personal render**:
A public render that read the principal during the render phase (`ctx.user`, `ctx.tokenScopes`, `ctx.apiToken`, `ctx.auth.can()`, `useUser()`), or that carries the admin bar or the principal's own locale. It is never stored in a shared segment's entry and leaves as `private, no-store`; a stored copy of the segment still serves the next principal in it. See ADR 0030.
_Avoid_: personalized render, per-user render

**Cache tag**:
A coarse label a stored response carries for invalidation — a type tag (`t:<type>`), an entry tag (`e:<id>`), a term tag (`tm:<id>`), a taxonomy list tag (`tx:<taxonomy>`), a user tag (`u:<id>`), or a settings tag (`s:<group>`). A page is stored under its resolved intent's tags plus the tags its render declared: the entities it embedded (each hydrated id under its lookup adapter's `kind`, or `embeddedCacheTags`), the terms it rendered or found by slug (`tm:<id>`), the taxonomies whose terms it listed through `taxonomyTermRows` (`tx:<taxonomy>`, which a term create or delete purges), the authors it resolved (`u:<id>`), the settings groups it read (`s:<group>`), and whatever a plugin named with `tagCdnEntry` from a loader, a component or an event or filter handler. A plugin route that opted into the CDN is stored under the tags declared while its handler ran, with no intent tags: what it named with `tagCdnEntry`, plus whatever core declared for what it read. A plugin's own data, which core doesn't model (a comment thread), goes in the plugin's namespace through `ctx.cache`: `ctx.cache.reads(key?)` stores the response under the key, or under the whole namespace without one, and `ctx.cache.changed(key?)` purges what read that key, or with no key everything in the namespace. Core names the namespace after the calling plugin's id, so a plugin can't reach another plugin's namespace or a core tag.

**Purge**:
Invalidation of stored responses by tag, or of a source's variants by its URL.
_Avoid_: bust, invalidate

**Rendered asset**:
Bytes a route produces once and then serves from object storage — a generated social card, a derived image. Read-through like the CDN, but keyed by a content-addressed storage key rather than by the request, so a changed input lands on a new key and there is nothing to purge.

**Variant**:
One transform of an image source — a width, a crop, a format — that a server runtime's (Node, Bun) image route renders once and keeps on disk under a hash of the request, bounded in size and purged by source when the media item behind it is trashed or deleted, since a variant carries its source's gating.

## SEO

**Canonical URL**:
The single normalized source-of-truth URL driving `<link rel="canonical">`, the redirect normalizer, sitemap, and `og:url`.

**Sitemap**:
The generated XML index at `/sitemap.xml`, naming one paged sub-sitemap per
sitemap scope. Served by `@plumix/plugin-seo` rather than by core, alongside
`/robots.txt`.

**Sitemap scope**:
One URL space the sitemap index lists: the published entries of a public entry
type, the term archives of a public taxonomy, or a URL space a plugin
contributed. The site, not the scope's contributor, decides whether it is listed
and what its URLs' `changefreq` and `priority` default to.

## Syndication

**Feed**:
The recent-items syndication output (RSS/Atom). Not an SEO surface — a reader
subscribes to it, a crawler does not read it — and served by
`@plumix/plugin-feeds` rather than by core.

**Archive feed**:
The feed of an archive, served at `<archive route>/feed` and advertised on the
archive's pages. It is the archive's own entry query, newest first and capped —
never a second query beside it — so only an archive described by an entry query
can have one.

## Search

**Search document**:
One searchable thing as the index sees it — a title, the plain text beside it,
and what it is a projection of. An entry or a term, in the same table, so one
ranked list can span both.

**Search projection**:
The materialized table of search documents, from which the FTS5 index is built.
Entry content is a block tree of HTML strings and SQLite has no regular
expressions, so the plain text has to be extracted in JavaScript once and stored
— which also makes rebuilding the index one SQL statement rather than a re-run
of the extractor over every block tree. Owned by `@plumix/plugin-search`.

## Testing

**Test site**:
A whole site built for a test, with a fake in place of every service it uses.
A feature test and an e2e test drive the same test site. See ADR 0070.
_Avoid_: harness, test app

**Feature test**:
A test of what a site does, driven through one of its entry points (a request,
a remote call, a scheduled firing) against a test site, named for the
capability it checks rather than a source file. The unit test, by contrast,
calls code directly.
_Avoid_: integration test

**Playground**:
The site a package keeps to run by hand and to drive its e2e tests. A site has
none, since it is its own.
_Avoid_: fixture site

## Disambiguation — one word, several meanings

These words each carry more than one meaning in the code. The glossary keeps
them distinct by **always qualifying** them; bare use is a smell.

- **manifest** — always qualify: **plugin manifest** (registry projection for
  admin), **document manifest** (`<head>` descriptor), **asset manifest** (Vite
  chunk map), **island runtime manifest** (bootstrap). Never write bare
  "manifest".
- **capability** — the **RBAC** sense (a permission string) vs the loose
  entitlement-label sense. Reserve "capability" for RBAC; use **entitlement**
  for the membership label. Neither an **infrastructure slot** nor a
  **configured slot** is a capability: those say what the deployment can do,
  a capability what a user may.
- **template** — the **theme render unit** (this glossary) vs the stored
  **page-template** choice an entry can pick vs the **project template** in the
  scaffolder. Qualify when more than one is in play.
- **snapshot** — the **revision** sense (capturing an entry into a revision)
  vs a **sync snapshot** (what a push takes of the deployed database before
  it replaces anything, to restore from) vs a **telemetry snapshot** (what a
  request or scheduled run recorded, handed to telemetry consumers). Qualify
  when more than one is in play.
- **read-through** — the **CDN** sense (a stored response, keyed by the
  request and purged by tag) vs the **rendered asset** sense (bytes behind a
  content-addressed storage key, which nothing purges). Qualify when more
  than one is in play.
- **slot** — the **config slot** (this glossary), including its
  **infrastructure slot** and **configured slot** senses, vs a **descriptor slot** (a
  named key on a plugin or theme descriptor, such as `i18n` or `templates`) vs
  a **slot input** (the block input holding child nodes) vs the **template
  slot** a theme's generic tier is made of. Qualify when more than one is in
  play.
- **runtime** — the **engine** (Workers, Node, Bun, Deno) vs the **config slot**
  named `runtime`, which holds a runtime adapter vs the `@plumix/runtime-*`
  **package** shipping one. Qualify when more than one is in play.
- **handler** — the **runtime handler** (this glossary) vs a **route handler**
  (what answers one registered path) vs an **event or filter handler**. Qualify when more than one is in play.
- **canonical** — reserved for the **canonical URL**. For a stored value already
  in the form its field's declared type implies, say **settled**, never
  "canonical".
- **entry vs post** — the canonical noun is **entry**. "post" is a specific
  entry type only.

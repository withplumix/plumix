# Plumix documentation — information architecture spec

The committed output of the wayfinder map [Plumix documentation information
architecture](https://github.com/withplumix/plumix/issues/1829). Fifteen decisions, recorded across
sixteen tickets, assembled into one artifact that writing sessions execute against.

**This file is internal.** `docs/` is never linked from the published site.

**Status:** structurally complete. No structural decisions are left open — see
[What a writing session still decides](#what-a-writing-session-still-decides) at the foot.

---

## 1. The shape

**15 sections · 104 pages · two levels throughout.** Section → page, never deeper.

The first release ships the **30 P0 pages**, written to the full page template. Everything else is
absent from the navigation and named in prose in its section's `Overview`.

Flatness is not an independent rule — it falls out of the roster policy. Sites that put each roster
item on its own page run 240–450 pages and three or four levels; folding rosters into indexed pages
is what keeps 104 pages flat. Section size is the lever, and the largest section here is 13.

---

## 2. The tree

Transcribe into `apps/docs/astro.config.mjs` in this order. Every section's first page is its
landing page, because a Starlight group label cannot itself be a link.

| # | Section | Pages | P0 |
| --- | --- | --- | --- |
| 1 | Getting Started | 5 | 5 |
| 2 | Content Modelling | 6 | 4 |
| 3 | Fields | 8 | 4 |
| 4 | Blocks | 9 | 2 |
| 5 | Islands | 4 | 0 |
| 6 | Themes | 8 | 4 |
| 7 | Routing | 6 | 2 |
| 8 | Access & Identity | 9 | 2 |
| 9 | APIs | 7 | 0 |
| 10 | Hooks | 5 | 0 |
| 11 | Extending the Admin | 7 | 0 |
| 12 | Going Further | 9 | 0 |
| 13 | Deployment | 6 | 4 |
| 14 | Plugins | 13 | 3 |
| 15 | Releases & Upgrades | 2 | 0 |
| | **Total** | **104** | **30** |

---

## 3. Page briefs

`T` is tier. **Covers** names the inventory areas the page is responsible for; the coverage check in
§7 is computed from this column.

### 1. Getting Started

Section landing page is `Introduction` rather than `Overview` — it is the site's front door, not a
subsystem summary. This is the one naming exception in the tree.

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `getting-started/introduction` | Introduction | P0 | What Plumix is, who it is for, what a site is made of. States once that the docs describe the current release and you should pin. | — |
| `getting-started/installation` | Installation | P0 | `pnpm create plumix-app` through to a running dev server and a first passkey. | scaffolder |
| `getting-started/project-structure` | Project Structure | P0 | What the scaffolder generated and what each file is for. Hosts the façade-subpath roster. | 34 façade subpaths |
| `getting-started/configuration` | Configuration | P0 | `plumix.config.ts`, its required slots and its optional ones. Hosts the config roster. | 20 config options, `EnvInput` |
| `getting-started/deploy` | Deploy Your Site | P0 | The five-minute path to a deployed site. Depth lives in Deployment. | — |

### 2. Content Modelling

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `content-modelling/overview` | Overview | P0 | The content model in one page, and **the canonical explanation that registration goes through a plugin descriptor** — most sites have one local plugin they never publish. Every later page assumes this and none re-explains it. | `definePlugin`, registration |
| `content-modelling/entry-types` | Entry Types | P0 | Declaring an entry type, its labels, hierarchy and archive behaviour. | entry types, supports |
| `content-modelling/taxonomies` | Taxonomies and Terms | P0 | Classifying entries; taxonomies scoped to entry types. | taxonomies, terms |
| `content-modelling/statuses` | Statuses and Publishing | P0 | The four statuses and the transitions between them. Hosts the status roster. | 4 statuses, scheduled publishing |
| `content-modelling/revisions` | Revisions and Autosave | P1 | Revision history, autosave, restore. | revisions, autosave |
| `content-modelling/entry-type-reference` | Entry Type Reference | P1 | Exhaustive options and labels. Roster page. | 21 options, 28 labels |

### 3. Fields

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `fields/overview` | Overview | P0 | What a meta-box field is and how declaring one is the only way to register a meta key. | meta model |
| `fields/meta-boxes` | Meta Boxes | P0 | Registering a meta box on entries, terms and users. | entry/term/user meta boxes |
| `fields/field-types` | Field Types | P0 | **Roster page.** Every field type, grouped by family, each with an example. | 24 canonical + 3 legacy + 2 plugin |
| `fields/builders` | Field Builders | P0 | The fluent builder API and why invalid chains are compile errors. | builder surface |
| `fields/references` | Reference Fields | P1 | Foreign ids into users, entries, terms and media; read-time resolution. | 6 reference kinds, lookup adapters |
| `fields/repeaters-and-groups` | Repeaters and Groups | P1 | Structured rows and nested field groups. | repeater, group |
| `fields/settings` | Settings | P1 | Settings groups and settings pages — same field shape, different storage. | settings groups/pages |
| `fields/conditional` | Conditional Fields | P2 | Showing a field based on another's value. | `isFieldVisible` |

### 4. Blocks

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `blocks/overview` | Overview | P0 | Entry content as a block tree; how it is stored and rendered. | entry content model |
| `blocks/core-blocks` | Core Blocks | P0 | **Roster page.** Every core block with its inputs and an example. `core/html` is one of them, and the one whose entry owes a reader a line about what the sanitizer does to its markup. | 18 core blocks |
| `blocks/authoring` | Authoring a Block | P1 | `defineBlock`, inputs, rendering, registration. | block authoring API |
| `blocks/marks` | Marks | P1 | **Roster page.** Inline formatting. | 13 marks |
| `blocks/styles` | Styles | P1 | The style field, CSS values, viewport breakpoints. | style codec, breakpoints |
| `blocks/validation` | Entry Content and Validation | P1 | Validating a block tree; what a validation error means. | `validateEntryContent` |
| `blocks/variations` | Variations | P2 | Named preset configurations of a block. | variations |
| `blocks/patterns` | Patterns | P2 | Reusable block arrangements. | pattern registry |
| `blocks/shortcodes` | Shortcodes | P2 | **Roster page.** Inline expansions. | core shortcodes |

### 5. Islands

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `islands/overview` | Overview | P1 | Why most of a Plumix page is static and what an island is. | island model |
| `islands/hydration` | Hydration Strategies | P1 | **Roster page, two axes.** `client` (5) and `prefetch` (3), and why `interaction`/`only` are excluded from prefetch at the type layer. | 5 strategies, 3 prefetch triggers |
| `islands/authoring` | Authoring an Island | P1 | `"use client"`, the shim, registration. | island authoring |
| `islands/props` | Props and Serialization | P2 | `IslandProps`, why function props are excluded at the type layer, the JSON round trip. | `IslandProps`, serialization |

### 6. Themes

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `themes/overview` | Overview | P0 | What a theme is; the fallback `welcomeTheme` when none is registered. | `defineTheme`, welcome theme |
| `themes/templates` | Templates | P0 | **Roster page.** `defineTemplate` and the builders. | 16 template builders |
| `themes/hierarchy` | Template Hierarchy | P0 | How a request resolves to a template; generic tiers and target matchers. | resolution, tiers, matchers |
| `themes/template-data` | Template Data | P0 | **Roster page.** Every data shape with its guard. | 9 shapes, 9 guards |
| `themes/document` | Document Manifest | P1 | Contributing to `<head>`. | `DocumentManifest` and kin |
| `themes/tokens` | Tokens and Breakpoints | P1 | Theme tokens and breakpoints. | tokens, breakpoints |
| `themes/primitives` | Component Primitives | P1 | `Link`, `Image`, `SignedIn`/`SignedOut`, `useAuth`, `PlumixProvider`. | renderer primitives |
| `themes/template-deps` | Template Dependencies | P2 | Declaring what a template needs loaded. | `TemplateDepRegistry` |

### 7. Routing

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `routing/overview` | Overview | **P0** | How a URL becomes a rendered page. Section landing page — P0 because the section ships and this is where its unwritten pages are named. | route intent |
| `routing/permalinks` | Permalinks and Slugs | P0 | Slugs, permalinks, canonical URLs. | slugs, permalinks |
| `routing/archives` | Archives | P1 | Archive routes and pagination. | archive types, pagination |
| `routing/redirects` | Redirects | P1 | Config, plugin and theme redirects; `410 Gone`. | redirect rules |
| `routing/rewrites` | Rewrite Rules | P2 | Custom rewrites. | rewrite rules |
| `routing/base-path` | Base Path | P2 | Serving under a subdirectory. | `basePath` |

### 8. Access & Identity

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `access/overview` | Overview | P0 | Principals, sessions, and the `hasSession` contract a custom authenticator must implement. | principal, session, `hasSession` |
| `access/passkeys` | Passkeys | P0 | WebAuthn sign-in — the default, and the only way into the admin out of the box. | passkeys, credentials |
| `access/roles` | Roles | P1 | **Roster page.** The five roles and the staff boundary. | 5 roles, `STAFF_MIN_ROLE` |
| `access/magic-links` | Magic Links | P1 | Email sign-in and the mailer slot. | magic link, mailer |
| `access/oauth` | OAuth | P1 | Third-party sign-in. | OAuth accounts |
| `access/capabilities` | Capabilities | P2 | **Roster page.** Core capabilities and derived per-type actions. | 17 core + 8 + 5 actions |
| `access/api-tokens` | API Tokens | P2 | Personal access tokens and device flow. | API tokens, device flow |
| `access/policy` | Access Policy | P2 | Segments, gates, entitlements. | access policy |
| `access/gating` | Gating Content | P2 | Teasers, paywalls, SEO implications. | teaser, paywall |

### 9. APIs

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `apis/overview` | Overview | P1 | The ways code talks to Plumix, and which to reach for. | — |
| `apis/context` | The Request Context | P1 | `AppContext`, `ctx.memo`, `memoBatch`. | request context, memoisation |
| `apis/rest` | REST | P1 | The default-deny REST API, envelopes, OpenAPI, `registerRestResource`. | REST surface |
| `apis/rpc` | RPC | P2 | Typed RPC between admin and worker; plugin routers. | RPC surface |
| `apis/mcp` | MCP | P2 | **Roster page.** The nine tools and the dev-trust gate. | 9 MCP tools |
| `apis/raw-routes` | Raw Routes | P2 | Mounting an arbitrary handler. | raw routes |
| `apis/database` | Direct Database Access | P2 | `plumix/db`, `plumix/schema`, and enqueuing purges when bypassing the mutation service. | db toolkit, purge vocabulary |

### 10. Hooks

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `hooks/overview` | Overview | P1 | Filters and actions; when each fires. | hook model |
| `hooks/filters` | Filters | P1 | Registering a filter; pipeline semantics. | filter API |
| `hooks/actions` | Actions | P1 | Registering an action; side-effect semantics. | action API |
| `hooks/reference` | Hook Reference | P1 | **Roster page.** All 105 names grouped by family; `rpc:*` grouped separately as mechanical. | 105 hooks — 59 filters, 46 actions |
| `hooks/type-augmentation` | Type Augmentation | P2 | `declare module "plumix"` — the single specifier, and why mixing fractures. | augmentation rules |

### 11. Extending the Admin

Entirely P2. Documents the admin **as an extension target** and never teaches anyone to publish an
entry — content-editor material is out of scope for this site.

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `admin/overview` | Overview | P2 | The admin ships precompiled and is closed for modification; extensions arrive as plugin chunks. | admin extension model |
| `admin/pages` | Admin Pages | P2 | Registering a page; re-export only, never imperative registration. | `adminPages` |
| `admin/widgets` | Dashboard Widgets | P2 | Registering a widget. | `dashboardWidgets` |
| `admin/login-links` | Login Links | P2 | Adding an affordance to the sign-in screen. | `loginLinks` |
| `admin/plugin-chunk` | The Plugin Chunk | P2 | How `adminEntry` becomes a bundle. | `adminEntry`, bundling |
| `admin/shared-runtime` | The Shared Runtime | P2 | The 15 `plumix/admin/*` shims as one mechanism — React, Query, Router, Lingui singletons. | 15 admin subpaths |
| `admin/styling` | Styling | P2 | The CSS cascade layer and why plugin styles are scoped. | admin CSS rules |

### 12. Going Further

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `going-further/overview` | Overview | P1 | Section landing page; names what this section covers. | — |
| `going-further/caching` | Caching | P1 | **Roster page** for the tag vocabulary. Edge cache, tags, purge. | cache tags, purge |
| `going-further/seo` | SEO | P1 | Canonicals, sitemap, feeds, robots, meta and OG. | SEO surfaces |
| `going-further/testing` | Testing | P1 | `plumix/test`, the context factory, Playwright helpers. **Promotion candidate** — becomes a section if it outgrows two pages. | 3 test subpaths |
| `going-further/dev-tools` | Dev Tools | P1 | Dev error pages, the client overlay, the debug bar, errors to terminal. | dev surfaces |
| `going-further/search` | Search | P2 | Entry and term search; the admin search filter. | search surface |
| `going-further/i18n` | Internationalization | P2 | Locales, `Label`, formatters, catalogs. | i18n surface, 5 locales |
| `going-further/scheduled-tasks` | Scheduled Tasks | P2 | Cron registration and the core tasks. | `scheduledTasks` |
| `going-further/telemetry` | Telemetry | P2 | Consumers, spans, `traceDbQuery`. | telemetry surface |

### 13. Deployment

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `deployment/overview` | Overview | P0 | What deploying a Plumix site involves. | — |
| `deployment/cloudflare` | Cloudflare Workers | P0 | The one shipped runtime: D1, R2, KV, Images, edge cache. | `@plumix/runtime-cloudflare` |
| `deployment/bindings` | Bindings and Environment | P0 | Wiring bindings to config slots. | bindings, slots |
| `deployment/secrets` | Secrets | P0 | `EnvInput`, `.dev.vars`, production secrets. | secret slots |
| `deployment/cli` | CLI Reference | P1 | **Roster page.** Commands and global flags. | 7 commands + 5 global flags |
| `deployment/runtimes` | Runtime Adapters | P2 | The adapter contract, for porting Plumix elsewhere. | `RuntimeAdapter` |

### 14. Plugins

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `plugins/overview` | Overview | P0 | Installing and configuring plugins. States the two version tracks. | plugin config |
| `plugins/blog` | Blog | P0 | The `post` entry type, `category` and `tag`. | `@plumix/plugin-blog` |
| `plugins/pages` | Pages | P0 | The hierarchical `page` type rooted at `/`. | `@plumix/plugin-pages` |
| `plugins/menu` | Menu | P1 | Navigation menus; locations. | `@plumix/plugin-menu` |
| `plugins/comments` | Comments | P1 | Threaded, moderated discussion. | `@plumix/plugin-comments` |
| `plugins/media` | Media | P1 | Media library, uploads, the `media` field types. | `@plumix/plugin-media` |
| `plugins/audit-log` | Audit Log | P2 | Activity feed. | `@plumix/plugin-audit-log` |
| `plugins/publishing` | Publishing a Plugin | P2 | Taking a local plugin to npm. | distribution |
| `plugins/descriptor` | The Plugin Descriptor | P2 | `id`, `version`, `setup` vs `provides`. | descriptor surface |
| `plugins/config-schema` | Config Schema | P2 | `schema` / `schemaModule` and validation. | plugin config schema |
| `plugins/admin-entry` | Admin Entry | P2 | Shipping admin UI from a plugin. | `adminEntry` and kin |
| `plugins/i18n` | Translation Catalogs | P2 | The `i18n` slot and catalog paths. | plugin i18n |
| `plugins/versioning` | Versioning and Peer Ranges | P2 | Peer ranges against a pre-1.0 platform. | peer versioning |

### 15. Releases & Upgrades

Both pages P1, so the whole section is absent at first release. `Release Notes` is the section
landing page.

| Slug | Title | T | Purpose | Covers |
| --- | --- | --- | --- | --- |
| `releases/notes` | Release Notes | P1 | Links the GitHub releases. Not a mirror of them. | — |
| `releases/upgrading` | Upgrading | P1 | One living page, newest first, with a section **only** for releases that contained a breaking change. | breaking changes |

---

## 4. The page template

**One template.** Reference sections are generated from frontmatter and render only when the
matching array exists — so a page teaches, and enumerates too if it has something to enumerate.

### Frontmatter

Enforced by `docsSchema({ extend })`. Because it intersects with Starlight's schema, added fields
are genuinely required and a page missing one fails the build.

| Field | Required | Notes |
| --- | --- | --- |
| `title` | yes | Starlight built-in. |
| `description` | **yes** | The lede. Also the page's `llms.txt` summary line. |
| `tier` | **yes** | `'P0' \| 'P1' \| 'P2'`. |
| `sidebar.label` | no | Used deliberately where the nav string should differ from the `<h1>` — nav reads `plumix/fields`, page reads "Field Types". |
| `stability` | no | `'experimental' \| 'deprecated'`. **No `stable` value** — at pre-1.0 nothing is, and absence is the baseline. |
| `since` | no | On pages carrying roster items that arrived recently. |
| `draft` | no | Holds an unwritten page out of the production build. |
| reference arrays | no | Drive the generated reference sections. |
| `srcLight` / `srcDark` | both-or-neither | Screenshot pair. Both `required: true` where a screenshot is used, so a single-theme capture is unpublishable. |

### Body

| # | Section | Required | Notes |
| --- | --- | --- | --- |
| 1 | **Lede** | **yes** | One or two sentences under the `<h1>`. Written to stand alone — it is an agent's first line of context. |
| 2 | `## Overview` | **yes**² | What this is and when you reach for it. Definitions land here. |
| 3 | `## Quickstart` | **yes**¹ | The smallest runnable thing. Uses `<Steps>`. |
| 4 | Body `##` sections | yes | Concept material. Screenshots inline, here. |
| 5 | Generated reference | conditional | Renders only when frontmatter provides it. |
| 6 | `## Recipes` | no | Worked examples beyond the quickstart. |
| 7 | `## Related` | **yes** | **Lateral** links — concepts this page touches. |
| 8 | `## Next steps` | **yes** | **Forward** path — what the reader does after. Not the same section as `Related`; do not merge them. |

² Exempt on a **section landing page**, whose own title is already `Overview`. The two rules
collide there: §3 names every section landing page `Overview`, and this table requires a `## Overview`
under it, so the page renders the word as its `<h1>` and again as its first `<h2>`. The page *is* the
overview. Give that opening section a heading naming what it actually covers — `## The content model`,
`## Route intents` — and the reader loses nothing. Enforced by `isSectionLanding` in
`apps/docs/src/content-checks/page-shape.ts`, which reads `title === "Overview"`.

Starlight labels its own top-of-page table-of-contents link `Overview` too, which duplicates the word
in the right rail of every page carrying the mandatory section, landing page or not. That is settled
separately, by overriding the `tableOfContents.overview` UI string to `Top` in
`apps/docs/src/content/i18n/en.json`. Do not solve it by renaming the body section.

¹ Exempt only when the page is a pure roster **and** every item carries its own runnable example —
the example moved, it did not vanish.

### Components

Named here so a writer never has to choose:

- `<Steps>` — the Quickstart's ordered sequence.
- `<Tabs>` with `syncKey` — package managers and any either/or that should stick sitewide.
- `<Aside>` — warnings, tips, gotchas. Repeated asides come from a partial, not copy-paste.
- `<Badge>` — inline stability markers. **Not** nav badges.
- `<Code>` with `?raw` — where a whole real file genuinely is the example.

### Length and splitting

**A page splits on a second audience or a second task — never on length.** A page grows without
limit while it serves one reader doing one job. Comparable sites run 700–1,000-line pages without
harm.

---

## 5. The roster item template

Rosters are **indexed pages** — one page per roster, items as `###` headings. Not one page per item.

**A roster is a page that promises *this is all of them*** — the set is closed, enumerable from
source, and a reader would be misled by an incomplete list. Size is irrelevant: 105 hooks and 5 roles
both qualify.

**Grouped by the axis the source already uses, never alphabetically.** The field roster is already
grouped into six families in `roster.ts`; hooks are already grouped by prefix. Adopting the source's
own axis keeps docs and code telling the same story.

Each item carries, in order:

1. A `###` heading with the item's **signature** and an **explicit stable `id`**. The id is a
   contract — it never changes, and a removed item leaves a tombstone rather than a silent 404.
2. One plain-English sentence.
3. A runnable example, with complete imports.
4. Extended options or notes, where the item has them.
5. Cross-links to related items.

**The example bar:** required, except an item that is a *pure variant of a documented sibling* —
`textarea` against `text`, `userList` against `user` — which links to the sibling's example and
states only what differs.

### The 17 rosters

`Field Types` · `Core Blocks` · `Marks` · `Shortcodes` · `Hook Reference` · `Capabilities` · `Roles` ·
`Hydration Strategies` · `Configuration` · `Entry Type Reference` · `Statuses and Publishing` ·
`Templates` · `Template Data` · `CLI Reference` · `MCP` · `Caching` (tag vocabulary) ·
`Project Structure` (façade subpaths).

**`supports` is deliberately not a roster.** The code accepts any string, so no complete list exists
to promise. Its page presents a **conventional, not closed** list and says so visibly — otherwise
someone will add a guard later assuming the omission was an oversight.

**The guard is authoritative for what a roster contains.** `apps/docs/src/content-checks/rosters.ts`
holds each roster's items and binds them to source; the sizes in the page briefs above are a
reader's orientation, not the contract. Where the two disagree the guard is right, and the next
reading of a source is a change there rather than a second correction here.

---

## 6. Authoring conventions

### Vocabulary

**`CONTEXT.md` is binding.** Every page uses its words and honours its `_Avoid_` lists — "entry",
never "post" for entry-in-general; "meta-box field", never "custom field". A docs site that invents
its own vocabulary re-scatters what the glossary unified.

### Voice

**Second person, present tense, active. Minimal preamble.** "You register an entry type by…" — no
throat-clearing before the first useful sentence. Word choice is the writer's.

### Imports — the single most durable rule here

**Every example imports from `plumix` or one of its subpaths. Never from `@plumix/core/...`.**

The façade is the stable half. `@plumix/core`, `@plumix/blocks` and the three `admin*` packages all
publish to npm, but consumers are meant to reach them only through `plumix` — and **nothing in the
package metadata says so**. Any page that documents a deep import is writing against the unstable
half.

State this once, in `Project Structure`, alongside the façade-subpath roster. Do not repeat it per
page; the rule is enforced by review and by every example following it.

### Naming no other product

The published site is about Plumix and nothing else. No comparisons, no parity claims, no "coming
from X" framing, no competitor names. Naming the actual stack is not a comparison and is fine:
Cloudflare Workers, D1, R2, TypeScript, React, Vite, WebAuthn.

### Cross-linking

- Inline link on **first mention** of another documented concept.
- A `## Related` block on every page — lateral.
- A `## Next steps` path on every page — forward.

Enforced by `starlight-links-validator` with anchor checking, failing the build.

### Examples

**Inline in the `.mdx`.** No fixture app, no samples directory.

Every example carries complete import lines and runs on its own — no page depends on having read the
one before it. All pages draw on **one shared example domain** with a fixed vocabulary, so the same
entry type, fields and slugs recur throughout and the estate reads as one product.

**The domain is not named here.** The **first P0 page written establishes it**, and every later page
uses it. It must not be a blog — `post` and `page` are real built-in types from `plugin-blog` and
`plugin-pages`, so modelling a blog would blur what Plumix gives you against what you defined.

### Screenshots

- **No screenshot may carry information absent from the prose.** The check: does the page survive
  with images stripped?
- **Inline**, beside the prose they illustrate — never a frontmatter hero slot.
- **Only where a page describes an admin or block-editor surface.** Elsewhere, zero.
- **Light and dark pair**, both `required: true`. Element-scoped by selector, fixed viewport, 2× DPR.
- Regenerated by one command; images committed.

### Agents

Coding agents are a first-class consumer. Three rules follow, all already stated above: complete
imports on every example, definitions before first use, and no information carried only in an image.

The site publishes `llms.txt`, `llms-full.txt` and `llms-small.txt` via `starlight-llms-txt`, plus a
per-page copy-as-markdown affordance.

### Stability and versions

- The site documents the **current release only**. It does not version pre-1.0.
- One site-wide statement, in `Introduction`: the docs describe the current release; pin your
  version. **Appearing on the site is not a stability promise.**
- `since` markers on roster items that arrived recently.
- **Two version tracks.** Platform packages move in lockstep; the six plugins version independently.
  Every install snippet must be right about which track it is on.

---

## 7. Coverage check

Every area of the public surface has a home. Mapping from the inventory:

| Surface | Home |
| --- | --- |
| 34 façade subpaths | `Project Structure` (15 admin shims folded into `The Shared Runtime`) |
| 20 config options | `Configuration` |
| 4 statuses · entry types · taxonomies | Content Modelling |
| 24 field types · builders · references · repeaters | Fields |
| 18 blocks · 13 marks · shortcodes · patterns · styles | Blocks |
| 5+3 hydration axes · `IslandProps` | Islands |
| 16 builders · 9 data shapes · 9 guards · manifest · tokens · primitives | Themes |
| permalinks · archives · redirects · rewrites · base path | Routing |
| 5 roles · 17+8+5 capabilities · 4 auth methods · policy · gating | Access & Identity |
| RPC · REST · 9 MCP tools · raw routes · db toolkit · request context | APIs |
| 105 hooks · type augmentation | Hooks |
| admin pages · widgets · login links · plugin chunk · shims · CSS | Extending the Admin |
| caching · SEO · search · i18n · cron · telemetry · testing · dev tools | Going Further |
| runtime adapter · bindings · secrets · CLI | Deployment |
| 6 official plugins · descriptor · packaging | Plugins |

**Deliberately undocumented:** the contribution guide and all core-contributor material; all
content-editor material; the editor bridge (`EDITOR_BRIDGE_CHANNEL` and kin, editor-internal); the
generated runtime entries (`editor-runtime`, `island-runtime`, `dev-client` — wired by the scaffolder
and the Vite plugin, mentioned in `Project Structure`, no page each); the three legacy field types
(`checkbox`, `radio`, `multiselect` — a retired subsection of the field roster); `demoPreset` and the
demo sandbox.

---

## 8. Prerequisites

None of this is writing. All of it blocks the first page.

**Dependencies**

1. Bump `@astrojs/starlight` to `>=0.41.5` — 0.41.4 and 0.41.5 fixed `extend` bugs with Zod enums and
   unions, and the `stability` enum is exactly that shape.
2. Add `starlight-auto-sidebar` (for its `depth` cap), `starlight-links-validator`,
   `starlight-llms-txt`.

**Configuration**

3. `autogenerate` sidebar with `_meta.yml` per section directory carrying label, order and `depth`.
4. `docsSchema({ extend })` per §4.
5. Global `tableOfContents.maxHeadingLevel: 2` — the default 2–3 turns a roster page's table of
   contents into a list as long as the page.
6. Declare a `root` locale now. Content is English-only; revisit when a contributor offers a full
   translation of the P0 set *and* commits to maintaining it.

**Tooling — one suite, not three**

7. `vitest` plus a config in `apps/docs`, and `plumix` as a devDependency. **Neither exists today.**
8. In that one suite, sharing one traversal of `src/content/docs/**`:
   - body-shape checks (mandatory sections present);
   - the code-sample extractor (every `ts`/`tsx` fenced block, default-on with an explicit opt-out,
     type-checked against real `plumix` types);
   - roster drift guards for all 17 rosters — a type-level `Equals<>` binding the test's list to the
     source type, plus a runtime assertion binding the same list to the page's item ids.
9. A screenshot capture script on the existing Playwright estate, a `docs:screenshots` command, and a
   CI job that runs it and **asserts success without diffing pixels**.
10. A light/dark image component for `.mdx`. Starlight ships no equivalent.

**Repo hygiene**

11. Revise the "markdown-only, no custom `.astro` components" premise in `apps/docs/README.md`. Pages
    are `.mdx` throughout.

---

## What a writing session still decides

Nothing structural. What is left is craft:

- **The example domain** — the first P0 page written establishes it, within the constraints in §6.
- **Prose.** Word choice, example content, how much detail an extended note carries.
- **Which pages need a screenshot** at all, within the budget in §6.
- **Whether a `## Recipes` section earns its place** on a given page.

If a writing session finds itself making a structural decision — where a page goes, whether something
is a roster, what a section is called — that is a defect in this spec. Raise it against the map rather
than deciding locally.

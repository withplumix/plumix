# Docs IA across Next.js, Nuxt, and Astro

Research for [#1830](https://github.com/withplumix/plumix/issues/1830), under the map
[#1829](https://github.com/withplumix/plumix/issues/1829).

**Question.** What information-architecture patterns recur across the Next.js, Nuxt, and Astro
documentation sites, and where do they diverge from Laravel? The map names three Laravel
properties as load-bearing — two levels deep everywhere; teach-then-enumerate per page; a
subsystem earns promotion to a top-level section whose first page is "Getting Started" — and this
survey tests whether they are Laravel idiosyncrasies or general practice.

**Method.** Every spine below is read from the nav source of truth in the project's own repo, not
from the rendered page. Page counts are file counts in that repo, taken 2026-08-21 at these refs:

| Project | Nav source of truth | Ref surveyed |
| --- | --- | --- |
| Next.js | the `docs/` directory itself — file-system routing, no manifest | `vercel/next.js@canary` |
| Nuxt | `docs/**/.navigation.yml` + numeric directory prefixes | `nuxt/nuxt@4.x` (= `nuxt.com/docs/4.x`) |
| Astro | [`astro.sidebar.ts`](https://github.com/withastro/docs/blob/main/astro.sidebar.ts) + [`src/content/nav/en.ts`](https://github.com/withastro/docs/blob/main/src/content/nav/en.ts) | `withastro/docs@main` |

**Shared limitation.** None of the three is a CMS. There is no admin UI, no content model, no
editorial role, and no plugin marketplace of the WordPress kind. Every finding here is about
developer-facing framework docs. The sibling survey covers the CMS gap.

---

## 1. Next.js

Source: <https://github.com/vercel/next.js/tree/canary/docs> — rendered at <https://nextjs.org/docs>.

### 1.1 Spine

Next.js has no nav manifest. The docs contribution guide states the rule and the reason
explicitly:

> The docs use **file-system routing**. Each folder and files inside `/docs` represent a route
> segment. These segments are used to generate the URL paths, navigation, and breadcrumbs.

and, under a heading "Why not use a manifest?":

> We considered using a manifest file (another popular way to generate the docs navigation), but we
> found that a manifest would quickly get out of sync with the files.

— <https://github.com/vercel/next.js/blob/canary/docs/04-community/01-contribution-guide.mdx>

Ordering comes from a two-digit numeric prefix on the folder or file; without one, entries sort
alphabetically. Nav labels come from each page's `title` frontmatter, overridden by `nav_title`
where the title is too long.

The four directories under `docs/`, with their frontmatter titles verbatim:

| Directory | Nav label (verbatim) | `.mdx` files |
| --- | --- | --- |
| `01-app` | **App Router** | 281 |
| `02-pages` | **Pages Router** | 161 |
| `03-architecture` | **Architecture** | 5 |
| `04-community` | **Community** (`nav_title`; `title` is "Next.js Community") | 3 |
| `index.mdx` | **Next.js Docs** | 1 |

Total: **451 pages.**

App Router and Pages Router are not both shown at once. A dropdown at the top of the sidebar
switches between them, so the reader sees one router's spine plus the two global sections.

**App Router spine, verbatim and in order:**

1. **Getting Started** — 19
2. **Guides** — 78
3. **API Reference** — 182
4. **Glossary** — 1 (`nav_title: Glossary`; `title: Next.js Glossary`)

**API Reference children, verbatim and in order** (this is the third level):

1. **Directives** — 6
2. **Components** — 6
3. **File-system conventions** — 35
4. **Functions** — 42
5. **Configuration** — 74
6. **CLI** — 3
7. **Adapters** — 13
8. **Edge Runtime** — 1
9. **Turbopack** — 1

**Pages Router spine, verbatim and in order:**

1. **Getting Started** — 7 (`title: Getting Started - Pages Router`, `nav_title: Getting Started`)
2. **Guides** — 47
3. **Building Your Application** — 21
4. **API Reference** — 85

**Architecture** — 5: Accessibility, Fast Refresh, Next.js Compiler, Supported Browsers.
**Community** — 3: Contribution Guide, Rspack.

### 1.2 Depth

Four levels below the router root, five path segments below `docs/`. The deepest live paths:

```
docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.mdx
docs/01-app/03-api-reference/05-config/01-next-config-js/images.mdx
docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/runtime.mdx
```

Which is: App Router → API Reference → File-system conventions → Metadata Files → `robots.txt`.

What earns the extra levels is **roster size**, in every case. `05-config/01-next-config-js`
holds 74 pages, one per `next.config.js` key. `04-functions` holds 42, one per exported function
or hook. `03-file-conventions` holds 35, one per magic filename, plus two nested rosters
(`01-metadata`, `02-route-segment-config`) that are themselves rosters-within-a-roster. No
narrative section goes past two levels: `01-getting-started` is a flat list of 18 pages, and
`02-guides` is 61 flat pages with four shallow clusters (`migrating`, `testing`, `upgrading`,
`client-side-data-fetching`) that exist because each cluster enumerates alternatives — one page
per test runner, one per source framework, one per major version.

### 1.3 On-ramp

**A quickstart chapter, no tutorial chapter.** `01-getting-started` is 18 numbered pages ordered,
per the contribution guide, "in the order developers should learn these concepts": Installation,
Project Structure, Layouts and Pages, Linking and Navigating, Server and Client Components,
Fetching Data, Mutating Data, Caching, Revalidating, Error Handling, CSS, Images, Fonts, Metadata
and OG Images, Route Handlers, Proxy, Deploying, Upgrading. It is a course in flat form, not a
single quickstart page.

The project-based tutorial lives on a **separate site**, <https://nextjs.org/learn>, and is not in
the docs tree at all.

Teaching also appears inline, and the style guide mandates it:

> **Overview:** The first paragraph of a page should tell the user what the feature is and what
> it's used for. Followed by a minimum working example or its API reference.

— contribution guide, "Page Templates"

### 1.4 Page template

The contribution guide declines to impose a strict template and then names the recurring sections:
Overview, Convention, Examples, API Tables, Next Steps (Related Links). What the pages actually
do, sampled:

`01-app/03-api-reference/04-functions/redirect.mdx` (API item):

```
## Reference  →  ### Parameters  ### Returns
## Behavior
## Example    →  ### Server Component  ### Client Component
## FAQ
## Version History
```

`01-app/03-api-reference/03-file-conventions/layout.mdx` (file convention, 728 lines):

```
## Reference  →  ### Props (#### children, #### params)  ### Layout Props Helper  ### Root Layout
## Caveats    →  7 subsections
## Examples   →  4 subsections
## Version History
```

`01-app/01-getting-started/06-fetching-data.mdx` (teaching page):

```
## Fetching data  →  ### Server Components  ### Streaming  ### Client Components
## Examples       →  ### Sequential  ### Parallel  ### Reusing data with React.cache
frontmatter: related.links → 6 cards rendered as "Next steps"
```

So: reference pages are `Reference → Behavior/Caveats → Examples → Version History`, and teaching
pages are `narrative → Examples → related cards`. **`Version History` is a fixed trailing section
on API pages** — a per-page changelog table, which is how a single-version site carries version
information.

### 1.5 Rosters

**Hand-written, one page per item, plus an index page that tables them.** There is no generator
anywhere in `docs/`. Every one of the 74 `next.config.js` options is its own hand-written `.mdx`
file. Each roster's `index.mdx` carries the overview table; the contribution guide calls this
"**API Tables**: API Pages should have an overview table at the top of the page with jump-to-section
links (when possible)", and links to child pages are auto-generated for any page that has children.

**The split point is one page per API item**, not one page per subsystem. The roster page in the
Laravel sense — narrative plus a long enumeration in one file — does not exist here; the
enumeration is the directory.

Two devices keep the two routers' rosters from drifting apart: a `source` frontmatter field that
pulls one page's body into another, and `<AppOnly>` / `<PagesOnly>` wrappers for the parts that
differ. Code blocks are hand-maintained; the guide says only "Always run examples locally before
committing them."

### 1.6 Extension authorship

**A subsection of API Reference, not a section.** Next.js has no plugin system; the nearest
surface is deployment adapters, at `01-app/03-api-reference/07-adapters` — 13 pages, in order:
Configuration, Creating an Adapter, API Reference, Testing Adapters, Routing with Next Routing,
Implementing PPR in an Adapter, Runtime Integration, Invoking Entrypoints, Output Types, Routing
Information, Use Cases, Immutable Static Assets. The section index reads "Use this section to build
and validate deployment adapters".

Everything else third-party-facing lives in `02-guides` as a use-case page (`multi-zones`,
`custom-server`, `instrumentation`, `open-telemetry`).

### 1.7 Versioning

**The site is single-version.** The repo holds one `docs/` tree on `canary`; there are no version
branches for docs and no version picker offering older docs. nextjs.org stamps the current release
onto the served page (`version: 16.3.2` in the markdown variant of
`/docs/app/getting-started/installation`), pre-release docs live at
<https://preview.nextjs.org>, and version history is carried three ways instead:

- a **`Version History`** section at the foot of API pages;
- `02-guides/upgrading/version-14|15|16.mdx` upgrade guides plus a codemods page;
- a **`version` frontmatter field** whose documented values are `experimental`, `legacy`,
  `unstable`, `RC` (contribution guide, "Optional Fields"), used on roughly 30 pages —
  `taint`, `inlineCss`, `useOffline`, `staticGeneration`, `forbidden`, `unauthorized`,
  `turbopackChunking`, and so on.

Unstable API surface is additionally marked in the slug itself: `unstable_cache`,
`unstable_noStore`, `unstable_rethrow` are page names.

One further mechanism worth noting for Plumix: `next upgrade` **updates the docs bundled inside the
installed package** at `node_modules/next/dist/docs/`, and the site publishes `/docs/llms.txt` and
`/docs/sitemap.md`. The docs are treated as a versioned artifact of the release, not only as a
website.

---

## 2. Nuxt

Source: <https://github.com/nuxt/nuxt/tree/4.x/docs> — rendered at <https://nuxt.com/docs/4.x>.

### 2.1 Spine

Nuxt's docs content is a package (`@nuxt/docs`) inside `nuxt/nuxt`; nuxt.com mounts it as a Nuxt
Content collection. `content.config.ts` in `nuxt/nuxt.com` binds one collection per version:

```ts
const docsV4Source = { repository: 'https://github.com/nuxt/nuxt/tree/4.x', include: 'docs/**/*', prefix: '/docs/4.x' }
```

— <https://github.com/nuxt/nuxt.com/blob/main/content.config.ts>

Order comes from the numeric directory prefix; the label comes from each directory's
`.navigation.yml` `title`.

**Spine, verbatim and in order, from `docs/*/.navigation.yml` on `4.x`:**

1. **Get Started** (`1.getting-started`) — 18
2. **Directory Structure** (`2.directory-structure`) — 29
3. **Guide** (`3.guide`) — 45
4. **API** (`4.api`) — 117
5. **Community** (`5.community`) — 6
6. **Migrate to Nuxt Bridge** (`6.bridge`) — 10
7. **Migrate to Nuxt 3** (`7.migration`) — 11
8. **Errors** (`errors`) — 25, `navigation: false`, so excluded from the tree and reachable only
   by link

Total: **262 `.md` files**, 237 of them in the navigable tree.

Two renderer-side facts change what a reader sees, and both come from `nuxt/nuxt.com`:

- **The sidebar shows only the current section.** `app/pages/docs/[...slug].vue` computes
  `asideNavigation` as the children of the top-level section the reader is in. The spine itself is
  not in the sidebar; it is in the header's "Docs" dropdown.
- **The header dropdown is a hand-curated list that does not match the directory spine.** From
  `app/composables/useNavigation.ts`, verbatim and in order: **Get Started, Structure, Guide, API,
  Deploy, Examples, Community**. "Structure" is a relabel of Directory Structure; "Deploy" is
  nuxt.com's own `content/deploy`; "Examples" is the `nuxt/examples` repo mounted at
  `/docs/4.x/4.examples`. Bridge and Migration are dropped from the dropdown and reached from the
  Upgrade page (the page component pushes an "Upgrade Guide" breadcrumb in front of them).

**Guide children, verbatim and in order:** Key Concepts (10), Best Practices (5), Working with AI
(2), Module Author Guide (9), Recipes (5), Going Further (13).

**API children, verbatim and in order:** Components (16), Composables (33), Utils (29), Commands
(16), Nuxt Kit (19), Advanced (2), Nuxt Configuration (1).

**Directory Structure children:** 18 pages at the section root (one per root-level file or folder —
`nuxt.config`, `package.json`, `.env`, `public/`, `server/`, `shared/`, …) plus the nested group
**app** (11: assets, components, composables, layouts, middleware, pages, plugins, utils,
app-config, app, error).

### 2.2 Depth

Three levels: section → subsection → page. Section indexes carry `navigation: false` and render as
card grids instead of appearing as pages (`3.guide/0.index.md`, `4.api/index.md`,
`2.directory-structure/index.md`, `3.guide/4.modules/index.md`).

What earns the third level, again, is roster size — Composables 33, Utils 29, Kit 19, Commands 16,
Components 16 — with one exception that is not a roster: **Directory Structure → app → …** is
three levels because the filesystem it documents is itself nested. The docs mirror the shape of the
thing they describe.

### 2.3 On-ramp

**A quickstart chapter, no tutorial chapter.** "Get Started" is 18 pages beginning Introduction,
Installation, Configuration, Views, Assets, Styling, Routing, SEO and Meta, Transitions, Data
Fetching… and ending Deployment, Testing, Upgrade. Like Next.js, it is a sequenced course rather
than a single page, and like Next.js there is no project-based tutorial in the docs (video courses
are a separate nuxt.com surface).

Teaching appears inline at the head of concept pages: `3.guide/1.concepts/1.rendering.md` opens by
explaining each rendering mode before the route-rule tables; `1.getting-started/10.data-fetching.md`
opens with "The Need for `useFetch` and `useAsyncData`" before enumerating options.

Notably, the Get Started chapter itself is teach-then-enumerate: `10.data-fetching.md` runs 830
lines and 32 headings, from motivation, through `$fetch` / `useFetch` / `useAsyncData`, into a full
`Options` roster (Lazy, Client-only, Minimize payload, Caching and refetching, Not immediate), and
closes with `Recipes`. That single page is the closest thing in this survey to Laravel's validation
page.

### 2.4 Page template

`4.api/2.composables/use-fetch.md` (API item):

```
frontmatter: links → [{ label: Source, to: <github url to the implementation> }]
## Usage       →  ### Reactive Keys and Shared State  ### Reactive Fetch Options
## Type
## Parameters
## Return Values → ### Status Values  ### Example
```

`1.getting-started/10.data-fetching.md` (teaching page):

```
## The Need for useFetch and useAsyncData
## $fetch / ## useFetch / ## useAsyncData
## Return Values
## Options  → 6 subsections
## Passing Headers and Cookies / ## Options API Support / ## Serializing…
## Recipes
```

`3.guide/1.concepts/1.rendering.md` (concept page): one `##` per mode — Universal, Client-Side,
Hybrid, Edge-Side — each with its trade-offs and a config snippet.

The recurring anatomy for API items is `Usage → Type → Parameters → Return Values`, with a **link
to the implementation source in frontmatter** on every composable page. There is no per-page
version-history section; Nuxt uses `::note` / `::warning` MDC callouts instead.

### 2.5 Rosters

**Hand-written throughout, split by size and by kind.**

- **Per-item pages** for composables (33), utils (29), components (16), CLI commands (16), Kit
  utilities (19).
- **One giant page** for configuration: `4.api/6.nuxt-config.md` is 2,525 lines and 216 headings,
  covering every `nuxt.config.ts` key from `alias` to `workspaceDir`. Its git history is ordinary
  human commits ("docs: document vite client and server options", "docs: add nodeTsConfig and
  sharedTsConfig options") — it is not generated, despite being derived from `@nuxt/schema`.
- **Tables** for hooks: `4.api/6.advanced/1.hooks.md` lists app, Nuxt, and Nitro hooks as markdown
  tables of hook / arguments / environment / description, above a link to the source file.
- **Feature-flag rosters** the same way: `3.guide/6.going-further/1.experimental-features.md` is one
  `##` per flag.

**The split point is item complexity, not roster length.** A composable needs its own page because
it has parameters, return values, and multiple usage modes; a config key needs three lines, so 216
of them share one page.

Nuxt is the only one of the three that **verifies its code samples in CI**. The root
`package.json` defines:

```
typecheck:docs = DOCS_TYPECHECK=true pnpm nuxt prepare && nuxt-content-twoslash verify --content-dir docs --languages html
lint:docs      = markdownlint ./docs && case-police 'docs/**/*.md' *.md && eslint docs
```

and `.github/workflows/docs.yml` runs both. Twoslash type-checks the TypeScript in the fenced
blocks against the real package types. `case-police` enforces consistent capitalisation of proper
nouns across the prose.

### 2.6 Extension authorship

**A subsection of Guide whose first page is a build-your-first walkthrough, plus a matching roster
under API.**

`3.guide/4.modules` — "Module Author Guide", 9 pages in order: **Create Your First Module**, Module
Anatomy, Recipes, Module Dependencies, Advanced Recipes, Testing, Best Practices, Ecosystem (plus a
`navigation: false` card-grid index).

`4.api/5.kit` — "Nuxt Kit", 19 pages: Modules, Programmatic Usage, Compatibility, Auto-imports,
Components, Context, Pages, Layout, Head, Plugins, Templates, Runtime Config, App Config, Nitro,
Resolving, Logging, Builder, Examples, Layers.

This is the clearest instance in the survey of Laravel's promotion pattern — a subsystem gets its
own place in the tree and opens with a getting-started page — but the teaching half and the
reference half sit in **different top-level sections**.

### 2.7 Versioning

**Versioned, per branch, with an explicit lifecycle.** `app/composables/useDocsVersion.ts` in
`nuxt/nuxt.com` is the register:

| Label | Branch | Path | Status |
| --- | --- | --- | --- |
| Version 5 | `main` | `/docs/5.x` | `prerelease` |
| Version 4 | `4.x` | `/docs/4.x` | `stable` |
| Version 3 | `3.x` | `/docs/3.x` | `unsupported`, EOL 31 July 2026, with a third-party extended-support link |
| Version 2 | `2.x` | `https://v2.nuxt.com` | `unsupported`, EOL 30 June 2024 |

The `Version` type carries `status: 'prerelease' | 'stable' | 'unsupported'`, `endOfLife`, and
`extendedSupport`, and `DocsVersionAlert.vue` / `VersionMenu.vue` render from it. The version
selector sits in the header next to the logo. Migration between versions is not a note but two
top-level sections (Migrate to Nuxt Bridge, Migrate to Nuxt 3).

Experimental surface is marked **on the page, not in the nav**: a dedicated
`3.guide/6.going-further/1.experimental-features.md` roster, and `::note` callouts of the form
"Note that these features are experimental and could be removed or modified in the future."

---

## 3. Astro

Source: <https://github.com/withastro/docs> — rendered at <https://docs.astro.build>.

Astro is the one whose stack matches Plumix's: Starlight, with the sidebar declared in
`astro.sidebar.ts` and labels held separately in `src/content/nav/*.ts` so they can be translated.

### 3.1 Spine

Four top-level groups, which the custom `Sidebar.astro` renders as **tabs**, not as stacked
sections. The component enforces the invariant:

```ts
if (entry.type !== 'group') {
  throw new Error('Top-level links are not permitted in the docs sidebar.');
}
```

— <https://github.com/withastro/docs/blob/main/src/components/starlight/Sidebar.astro>

and `astro.sidebar.ts` documents it: "Top-level groups become tabs."

**Spine, verbatim and in order** (labels from `src/content/nav/en.ts`):

1. **Tutorial** — 7 sidebar entries (33 pages exist)
2. **Guide** — 83
3. **Reference** — 41
4. **Ecosystem** — 109

Total sidebar links: **240**, out of 420 English `.mdx` files. The gap is almost entirely the 148
`reference/errors/*` pages, which are reachable by link from the generated error reference but do
not appear in the nav.

**Guide, verbatim group labels and in order** (from `en.ts`, with counts):

| Group | Pages |
| --- | --- |
| **Welcome, world!** | 3 — Why Astro, Astro Islands, Astro courses |
| **Start a new project** | 3 — Install and set up, Project structure, Develop and build |
| **Configuration** | 7 |
| **Routing and navigation** | 7 |
| **Build your UI** | 7 |
| **Add content to your site** | 4 |
| **Server rendering** | 5 |
| **Upgrade** | 1 + **Major upgrade guides** (7, collapsed) |
| _(ungrouped)_ Troubleshooting | 1 |
| **How-to recipes** | 22 (autogenerated from `recipes/`, collapsed) |
| **Migrate to Astro** | 15 (autogenerated, collapsed) |
| _(ungrouped)_ Contribute to Astro | 1 |

**Reference, verbatim and in order:**

| Entry | Pages |
| --- | --- |
| **Astro Template Syntax** | 2 |
| Configuration Reference | 1 |
| CLI Commands | 1 |
| Imports | 1 |
| Routing Reference | 1 |
| **Runtime API** | 14 — `api-reference` plus 13 `astro:*` module pages |
| **Other development APIs** | 12 |
| **Experimental features** | 7 |
| Legacy flags | 1 |
| Error reference | 1 |

**Ecosystem, verbatim and in order:**

| Group | Pages |
| --- | --- |
| **UI frameworks** | 6 |
| **Adapters** | 4 |
| **Other official integrations** | 4 |
| **Deployment guides** | 33 (autogenerated) |
| **Content management systems** | 45 (autogenerated) |
| **Backend services** | 10 (autogenerated) |
| **Image and video hosting** | 4 (autogenerated) |
| _(ungrouped)_ Ecommerce, Authentication, Testing | 3 |

### 3.2 Depth

Tab → group → page is the norm: two levels below the tab. Exactly one place goes deeper —
**Guide → Upgrade → Major upgrade guides → v7…v1**. What earns it is a set of seven pages that are
each a one-time-use document; nesting and collapsing them keeps six dead entries out of the reader's
way while leaving `upgrade-astro` (the page you actually want) at the group's top.

The other collapsed groups — recipes, migration, deployment, CMS, backend, media — take the same
treatment without the extra level: `collapsed: true` plus `autogenerate`, so 45 CMS guides occupy
one closed row until wanted.

### 3.3 On-ramp

**Both, and they are separated by tab.** Astro is the only one of the three to ship a
project-based tutorial in the docs: the **Tutorial** tab, "Build your first Astro Blog", 7 units
(Welcome world / Setup / Pages / Components / Layouts / Astro API / Islands) of 33 pages. The
sidebar lists only the 7 unit landing pages; the numbered lessons inside each unit are chained by
prev/next. Tutorial pages have their own frontmatter type (`type: tutorial`, `unitTitle`) and their
own components — `Checklist`, `Box`, `Lede`.

Alongside it, `getting-started.mdx` is a Starlight hero landing page whose two calls to action are
"Install Astro" and "Learn about Astro's features" — and `install-and-setup` is the quickstart.

Teaching also appears inline, but **only in the Guide and Ecosystem tabs.** Reference pages do not
teach. `reference/modules/astro-actions.mdx` is a bare list of exports; the narrative for the same
subsystem is a separate page, `guides/actions.mdx`, in a different tab. Same for
configuring-astro/configuration-reference, routing/routing-reference, content-collections/
`astro:content`, and integrations/integrations-reference. **Astro pairs a Guide page with a
Reference page, one pair per subsystem.**

### 3.4 Page template

`guides/content-collections.mdx` (Guide concept, 1,053 lines):

```
frontmatter: i18nReady, tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 }
## What are Content Collections?  → ### Types of collections ### When to create ### When not to
## TypeScript configuration for collections
## Defining build-time content collections
## Build-time collection loaders  → glob() / file() / custom
## Defining the collection schema
## Querying build-time collections
## Generating Routes from Content
## Live content collections
## Using JSON Schema files in your editor
```

`reference/modules/astro-actions.mdx` (Reference module):

```
frontmatter: sidebar.label: 'astro:actions'   ← the nav label is the import specifier
## Imports from `astro:actions`   → one ### per export, one #### per property
## `astro:actions` types          → one ### per exported type
```

`guides/integrations.mdx` (Guide, consumer then author):

```
## Official integrations / ## Automatic integration setup / ## Upgrading / ## Removing / ## Finding more
## Building your own integration
## Publishing your integration to npm  → ### Quick start ### Creating a package ### Developing ### Testing ### Publishing ### Integrations library ### Share
```

Two recurring devices: `tableOfContents.maxHeadingLevel` caps the on-page TOC so deep `####` nesting
does not flood the right rail, and `sidebar.label` decouples the nav string from the `<h1>` —
"Actions API Reference" in the page, `astro:actions` in the sidebar.

Astro also types its frontmatter per page kind. `src/content.config.ts` defines separate Zod schemas
for `deploy`, `backend`, `cms`, `media`, `integration`, `migration`, `tutorial`, and `recipe`, each
with mandatory fields — an `integration` page's title is refined to `startsWith('@astrojs/')`; deploy
pages must declare `supports: ('static' | 'ssr')[]`; CMS, backend, media, and migration pages carry a
`stub: boolean`. **The page template is enforced by the content schema, not by convention.**

### 3.5 Rosters

**Hybrid, and the split is explicit.** Two generators live in `scripts/`:

- `docgen.mjs` fetches
  `withastro/astro:packages/astro/src/types/public/config.ts`, parses its `@docs` JSDoc, and emits
  `reference/configuration-reference.mdx`.
- `error-docgen.mjs` fetches `packages/astro/src/core/errors/errors-data.ts` and emits
  `reference/error-reference.mdx`.

Both stamp a header into the generated file:

> NOTE: This file is auto-generated from 'scripts/docgen.mjs'. Do not make edits to it directly,
> they will be overwritten. Instead, change this file: …

and both render a `<DontEditWarning/>` component on the page, so a reader who lands on a generated
roster is told where the truth lives. `<Since v="7.2.0" />` marks when each option arrived.

Everything else is hand-written: CLI Commands (47 headings, one `##` per command and `###` per
flag), Routing Reference, the 13 `astro:*` module pages, the Integration API (2,705 lines, 142
headings). The 148 individual error pages under `reference/errors/` are hand-written too;
`error-docgen.mjs` reads that directory to decide which errors it can deep-link to.

**The split point is: generated where a machine-readable source of truth already exists in the
framework repo (the config type, the error table); hand-written where the roster is a design
surface (CLI, integration hooks, module exports).**

### 3.6 Extension authorship

**Spread across two tabs by kind, with no dedicated section.**

- Consumer-facing: **Ecosystem** tab — UI frameworks, Adapters, Other official integrations,
  33 deployment guides, 45 CMS guides.
- Author-facing narrative: `guides/integrations.mdx`, whose second half is "Building your own
  integration" and "Publishing your integration to npm".
- Author-facing reference: the **Other development APIs** group in the Reference tab — Integration
  API, Adapter API, Renderer API, Content Loader API, Image Service API, Dev Toolbar App API,
  Session Driver API, Font Provider API, Cache Provider API, Logger API, Container API, Programmatic
  API. Twelve pages, one per extension point.

The Integration API page alone documents 14 lifecycle hooks with every option of every hook, and
runs to 142 headings — bigger than most of the framework's guides.

### 3.7 Versioning

**Unversioned.** `astro.config.ts` declares one site, `https://docs.astro.build/`, with no
version dimension; there is no version selector anywhere on the rendered page. Older versions are
served by upgrade guides instead — the **Major upgrade guides** subgroup, v7 back to v1 — and by a
site-wide `banner` on the landing page ("Astro v7 is here! Learn how to upgrade your site").

Experimental features get **their own nav group**, `reference.experimental` = "Experimental
features", holding an index page ("Configuring experimental flags") plus one page per live flag.
Each flag page opens with a typed header block:

```
**Type:** `boolean`
**Default:** `false`
<Since v="7.2.0" />
```

and the index page states the contract in prose: these "are not guaranteed to be stable and may
include breaking changes even in small `patch` releases", and "The experimental feature
documentation will always be updated for the current released version only." A parallel
`reference/legacy-flags` page holds the other end of the lifecycle. **A flag graduating out of
experimental is a nav move**, not an edit to a badge.

---

## 4. Comparison

### 4.1 Spines side by side

| | Next.js | Nuxt | Astro | Laravel |
| --- | --- | --- | --- | --- |
| Top-level sections | 4 (2 are router variants) | 7 (+1 hidden) | 4 tabs | ~20 |
| Pages in nav | ~450 | ~237 | 240 | ~90 |
| Nav SSOT | the directory tree | `.navigation.yml` + numeric prefixes | one TS file | one nav file |
| Max depth | 4 below the router | 3 | 2, once 3 | 2 |
| Whole spine visible at once | one router at a time | no — section only | yes, per tab | yes |

### 4.2 What all three do that Laravel does not

**Teach and enumerate live in different places.** Every one of the three splits the two, and each
splits at the top level of the tree:

| Subsystem | Teaching page | Reference page |
| --- | --- | --- |
| Next.js data fetching | `app/getting-started/fetching-data` | `app/api-reference/functions/fetch` |
| Nuxt data fetching | `getting-started/data-fetching` | `api/composables/use-fetch` |
| Astro actions | `guides/actions` | `reference/modules/astro-actions` |
| Astro integrations | `guides/integrations` | `reference/integrations-reference` |

The pairing is maintained by cross-link: Next.js `related.links` frontmatter that renders as cards,
Nuxt's `:read-more{to=…}` MDC component, Astro's inline prose links. **The unit of completeness is
the pair, not the page.**

**Depth is bought with roster size.** Every third and fourth level in this survey exists because a
roster grew past what one page can hold: 74 Next.js config keys, 42 functions, 35 file conventions;
33 Nuxt composables, 29 utils; Astro's 45 CMS guides. Narrative sections stay flat in all three.
The one non-roster exception is Nuxt's Directory Structure → app, which nests because the directory
it documents nests.

**Rosters get real machinery.** Next.js has `source` + `<AppOnly>`/`<PagesOnly>` to keep two
routers' copies in sync. Nuxt type-checks every fenced block in CI with twoslash. Astro generates
the two rosters that have a machine-readable source and stamps a "do not edit" banner on them.
None of the three treats an exhaustive hand-written roster as a thing you simply keep current by
being careful.

**Alternative-enumeration guides are a first-class, collapsed shape.** Astro's 45 CMS guides,
33 deployment guides, 15 migration guides; Next.js's 5 testing guides, 3 migration guides; Nuxt's
Deploy section on nuxt.com. All are one page per third-party target, all collapsed by default, and
Astro allows them to be marked `stub: true` in the schema — a declared-incomplete page is a
supported state, not an embarrassment.

### 4.3 Where the three diverge from each other

- **Sidebar scope.** Astro shows a whole tab; Next.js shows one router; Nuxt shows only the current
  section and keeps the spine in a header dropdown. Nuxt's is the only one where you cannot see the
  whole map from inside a page.
- **Nav truth vs rendered truth.** Nuxt's rendered spine (Get Started, Structure, Guide, API,
  Deploy, Examples, Community) is hand-written in the website repo and does not match the docs
  repo's directory spine. Next.js and Astro have exactly one place to look.
- **Generation.** Astro generates two rosters; Next.js and Nuxt generate none.
- **Versioning.** Nuxt runs four versions off four branches with an EOL lifecycle in the version
  register; Next.js and Astro run one, and lean on upgrade guides plus per-page version notes.
- **Tutorial.** Only Astro ships one in the docs; Next.js exiled it to a separate site
  (nextjs.org/learn); Nuxt has none.
- **Frontmatter rigour.** Astro validates page shape per kind with Zod; Next.js documents two
  required and four optional fields in prose; Nuxt uses Nuxt Content's loose frontmatter.

---

## 5. Verdict: do Laravel's three properties generalise?

### Property 1 — two levels deep, everywhere: **does not generalise.**

Astro is the only near-match, at tab → group → page with one deliberate exception. Nuxt runs three
levels in every section that has a roster. Next.js runs four below the router, and five path
segments deep in the metadata and route-segment-config rosters.

But the *reason* Laravel is flat does generalise, inverted: **all three go deep only for rosters,
and stay flat for narrative.** Next.js's Getting Started is 18 flat pages; Nuxt's Get Started is 18
flat pages; Astro's Guide groups run 3 to 7 flat pages each. Laravel's flatness holds at ~90 pages
because Laravel folds its rosters into its narrative pages. The three frameworks have 240–450 pages
because they do not.

For Plumix this is the load-bearing finding. Two levels is not a property you adopt; it is a
consequence of the roster policy. The map already commits to Laravel-shaped rosters — narrative plus
exhaustive enumeration in one file — and that commitment is what will keep the tree flat. If any
roster later outgrows its page (the hooks roster is the likely first), the choice is between
breaking flatness and splitting the page, and every framework here chose to break flatness.

### Property 2 — teach, then enumerate, per page: **does not generalise. It is a Laravel idiosyncrasy.**

All three split teaching from enumeration and put them in different top-level sections, then bind
them with cross-links. Not one of them has a page that is 40% narrative and 60% roster as a matter
of policy.

Two qualifications, both of which matter:

- Nuxt's Get Started chapter comes close by accident. `getting-started/data-fetching.md` is 830
  lines running motivation → API tour → full options roster → recipes, and it is complete on its
  own. So the shape is viable at Nuxt's scale; it is simply not what Nuxt does elsewhere.
- Next.js codifies teaching *at the head of every page*, including reference pages: "The first
  paragraph of a page should tell the user what the feature is and what it's used for. Followed by a
  minimum working example or its API reference." That is Laravel's instinct at paragraph scale
  rather than page scale.

The competing convention is strong enough to name: **the Guide/Reference pair.** One narrative page
and one roster page per subsystem, cross-linked, each in its own top-level section. Astro applies
it most systematically; Next.js and Nuxt apply it too. Whichever Plumix picks, picking is the
decision — the failure mode is a tree where some subsystems are folded and others are paired, which
is how a reader loses the ability to predict where a fact lives.

### Property 3 — a subsystem earns promotion, first page "Getting Started": **generalises in shape, not in name.**

Promotion happens everywhere, always triggered by size, and the promoted section reliably opens with
an orientation page:

| | Promoted subsystem | First page |
| --- | --- | --- |
| Next.js | Adapters (13 pages) | index → "Configuration" → "Creating an Adapter" |
| Nuxt | Module Author Guide (9) | **"Create Your First Module"** |
| Nuxt | Nuxt Kit (19) | "Modules" |
| Astro | Ecosystem (109) | per-group first entry |
| Astro | Guide groups | "Why Astro", "Install and set up" |

Nuxt's Module Author Guide is a direct match for the Laravel pattern: a subsystem outgrew a page,
became its own place in the tree, and its first page is a build-your-first walkthrough. Astro's
Guide groups do the same at group scale — "Welcome, world!" opens with Why Astro, "Start a new
project" opens with Install and set up.

Nobody except Laravel literally names the page "Getting Started". They name it after what it does:
"Create Your First Module", "Creating an Adapter", "Install and set up", "Why Astro". Given the
map's glossary discipline, the descriptive name is the better convention to copy — but the property
underneath (**every section opens with a page that orients before it enumerates**) holds in all
three, and should be a rule in the Plumix spec.

### 5.1 Divergences that matter for Plumix

1. **Flatness is downstream of the roster policy.** Keep them together as one decision. Any roster
   that has to split into per-item pages takes the tree to three levels with it.
2. **The Guide/Reference pair is the industry default; folding is the Laravel exception.** Plumix
   should choose deliberately and apply the choice uniformly. A hybrid tree is the worst outcome.
3. **Every framework has drift machinery for rosters.** Astro generates from types and stamps
   "do not edit"; Nuxt type-checks fenced code with `nuxt-content-twoslash verify` in CI; Next.js
   dedupes with a `source` frontmatter field. The map's open question about roster drift control
   already has an in-repo precedent (the field-type roster guard); Nuxt's twoslash gate is the
   closest prior art for the map's other open question, code-sample policy.
4. **Stubs are a supported state elsewhere.** Astro's content schema has an explicit
   `stub: boolean` on CMS, backend, media, and migration pages, and collapses those groups by
   default. The map currently prefers absent pages over stubs; worth re-testing that specifically
   for the "one page per third-party target" shape — the official-plugins question in the map's fog
   is exactly that shape.
5. **Astro's nav is the one to copy mechanically.** Same stack. `astro.sidebar.ts` holds structure,
   `src/content/nav/en.ts` holds labels, and `Sidebar.astro` throws on a top-level link. If Plumix
   ever ships docs i18n, splitting label from structure now costs nothing and is otherwise a
   migration.
6. **Experimental status as a nav position, not a badge.** Astro puts every experimental flag in a
   dedicated nav group and moves the page out when the flag graduates; Next.js has a `version:
   experimental | legacy | unstable | RC` frontmatter field; Nuxt keeps one roster page. Plumix has
   experimental surface today (experimental flags, unstable APIs) and no convention for it.
7. **Docs as a release artifact.** `next upgrade` refreshes the docs inside `node_modules/next/dist/docs/`,
   and nextjs.org publishes `/docs/llms.txt` and `/docs/sitemap.md`. For a project whose users run
   coding agents against it, this is a cheap, high-leverage pattern that no ticket in the map
   currently covers.

---

## Sources

**Next.js**

- Docs tree: <https://github.com/vercel/next.js/tree/canary/docs>
- Docs Contribution Guide (file structure, frontmatter fields, page templates, code-block rules):
  <https://github.com/vercel/next.js/blob/canary/docs/04-community/01-contribution-guide.mdx>
- Section index frontmatter: `docs/01-app/index.mdx`, `docs/02-pages/index.mdx`,
  `docs/03-architecture/index.mdx`, `docs/04-community/index.mdx`
- Sampled pages: `docs/01-app/03-api-reference/04-functions/redirect.mdx`,
  `docs/01-app/03-api-reference/03-file-conventions/layout.mdx`,
  `docs/01-app/01-getting-started/06-fetching-data.mdx`, `docs/01-app/02-guides/authentication.mdx`
- Rendered: <https://nextjs.org/docs>, <https://nextjs.org/docs/app/getting-started/installation>

**Nuxt**

- Docs content: <https://github.com/nuxt/nuxt/tree/4.x/docs> (and `main` = 5.x)
- Nav config: `docs/.navigation.yml` and `docs/*/.navigation.yml`
- Version register: <https://github.com/nuxt/nuxt.com/blob/main/app/composables/useDocsVersion.ts>
- Header spine: <https://github.com/nuxt/nuxt.com/blob/main/app/composables/useNavigation.ts>
- Sidebar scoping: <https://github.com/nuxt/nuxt.com/blob/main/app/pages/docs/%5B...slug%5D.vue>
- Version-to-branch binding: <https://github.com/nuxt/nuxt.com/blob/main/content.config.ts>
- Docs CI: <https://github.com/nuxt/nuxt/blob/main/.github/workflows/docs.yml>, root `package.json`
  (`lint:docs`, `typecheck:docs`)
- Sampled pages: `docs/1.getting-started/10.data-fetching.md`, `docs/4.api/2.composables/use-fetch.md`,
  `docs/3.guide/1.concepts/1.rendering.md`, `docs/4.api/6.nuxt-config.md`,
  `docs/3.guide/4.modules/1.getting-started.md`, `docs/4.api/6.advanced/1.hooks.md`
- Rendered: <https://nuxt.com/docs/4.x/getting-started/introduction>

**Astro**

- Sidebar: <https://github.com/withastro/docs/blob/main/astro.sidebar.ts>
- Labels: <https://github.com/withastro/docs/blob/main/src/content/nav/en.ts>
- `group()` helper: <https://github.com/withastro/docs/blob/main/config/sidebar.ts>
- Tabs and the no-top-level-links invariant:
  <https://github.com/withastro/docs/blob/main/src/components/starlight/Sidebar.astro>
- Site config: <https://github.com/withastro/docs/blob/main/astro.config.ts>
- Per-kind frontmatter schemas: <https://github.com/withastro/docs/blob/main/src/content.config.ts>
- Generators: <https://github.com/withastro/docs/blob/main/scripts/docgen.mjs>,
  <https://github.com/withastro/docs/blob/main/scripts/error-docgen.mjs>
- Sampled pages: `src/content/docs/en/guides/content-collections.mdx`,
  `src/content/docs/en/reference/modules/astro-actions.mdx`,
  `src/content/docs/en/guides/integrations.mdx`,
  `src/content/docs/en/reference/integrations-reference.mdx`,
  `src/content/docs/en/reference/cli-reference.mdx`,
  `src/content/docs/en/reference/experimental-flags/index.mdx`,
  `src/content/docs/en/reference/experimental-flags/incremental-build.mdx`,
  `src/content/docs/en/tutorial/0-introduction/index.mdx`,
  `src/content/docs/en/getting-started.mdx`
- Rendered: <https://docs.astro.build/en/getting-started/>

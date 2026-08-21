# Docs IA across CMS platforms that ship an admin UI

Research for [#1831](https://github.com/withplumix/plumix/issues/1831), under the docs-IA map
[#1829](https://github.com/withplumix/plumix/issues/1829).

**Question.** How do CMS platforms structure their developer documentation? By CMS platform I mean a
product that ships an admin UI, a content model, and a plugin system.

**Method.** Primary sources only. Where a docs repo publishes its sidebar config, the spine below
was read from that file rather than from the rendered page; where it does not, the spine was read
from the shipped nav payload of the live site. Each product's section names its source. Page counts
are counted from the same artifact that supplies the order. Claims that could not be traced to a
source that owns them are marked UNVERIFIED.

Six products, in the order the ticket lists them: Payload, Strapi, Sanity, Directus, Statamic,
EmDash.

---

## Payload

Source of truth for the spine: the nav payload shipped in the rendered page at
<https://payloadcms.com/docs/getting-started/what-is-payload>, which embeds the full group →
topic → page tree. The ordering rule behind it is committed at
<https://github.com/payloadcms/website/blob/main/src/collections/Docs/topicOrder.ts>, which holds
one array of `{ groupLabel, topics[] }` per docs version; page order inside a topic comes from an
`order` number in each file's frontmatter in
<https://github.com/payloadcms/payload/tree/main/docs>.

### 1. Spine, verbatim and in order

Payload's spine has **two levels above the page**: a *group* (five of them, unlinked headings) and
a *topic* (26 of them, each a folder). Verbatim, in order, with page counts:

| Group | Topics (verbatim, in order) | Pages |
| --- | --- | --- |
| **Basics** | Getting-Started (4), Configuration (6), Database (7), Fields (23), Access-Control (4), Hooks (5) | 49 |
| **Managing Data** | Local-API (4), REST-API (1), GraphQL (3), Queries (5) | 13 |
| **Features** | Admin (9), Custom-Components (8), Authentication (8), Rich-Text (13), Live-Preview (4), Versions (3), Upload (2), Folders (1), Email (1), Jobs-Queue (7), Query-Presets (1), Trash (1), Troubleshooting (1), TypeScript (3) | 62 |
| **Ecosystem** | Plugins (13), Ecommerce (5), Examples (1), Integrations (1) | 20 |
| **Deployment** | Production (3), Performance (1) | 4 |

**148 pages** in the live nav. The repo carries 154 `.mdx` files under `docs/`, so six files exist
without a nav slot, `docs/hierarchy/overview.mdx` and `docs/migration-guide/{overview,v3,v4}.mdx`
among them (<https://github.com/payloadcms/payload/tree/main/docs>). The topic labels are the
hyphenated folder names verbatim (`Getting-Started`, `Access-Control`, `Live-Preview`), not
prettified.

### 2. Depth

**Three levels: group → topic → page.** The group is a visual band, not a route: there is no
`/docs/basics` page. So the *navigable* depth is two, matching Laravel, but the sidebar renders
three tiers. What earned the extra level is scale: 148 pages under 26 topics would be an
unscannable flat list, and the five groups sort those 26 topics into a reading order (learn the
model → get data out → optional features → ecosystem → ship).

### 3. On-ramp

**A quickstart page, no tutorial chapter.** `Getting-Started` is four pages, *What is Payload?*,
*Use Cases*, *Payload Concepts* and *Installation*, and none of them build an application. Installation
is the only procedural page: `## Software Requirements` → `## Quickstart with create-payload-app` →
`## Adding to an existing app` → five numbered `####` steps
(<https://github.com/payloadcms/payload/blob/main/docs/getting-started/installation.mdx>). The
tutorial role is delegated out of the docs entirely, to the `Examples` topic, one page that links
to runnable repos.

Teaching *does* appear inline at the head of concept pages, but briefly: one or two sentences of
definition, then a screenshot, then the smallest possible config snippet, then the roster. This is
Laravel's teach-then-enumerate at a much lower narrative ratio, roughly 10% narrative, 90% roster
on a field page, against Laravel's 40/60.

### 4. Page template

Frontmatter is `title` / `label` / `order` / `desc` / `keywords`. `title` is the page's `<h1>`
("Text Field"); `label` is what the sidebar shows ("Text"). That split lets a nav item be terse
while the page heading stays searchable.

**Text Field** (<https://github.com/payloadcms/payload/blob/main/docs/fields/text.mdx>), one
definitional sentence → `<LightDarkImage>` screenshot of the field in the admin panel → "To add a
Text Field, set the `type` to `text`" + 6-line snippet → `## Config Options` (a 21-row table) →
`## Admin Options` → `## Example` → `## Custom Components` → `### Field` → `#### Server Component`
→ `#### Client Component` → `### Label` → `#### Server Component` → `#### Client Component`.

**Access Control** (<https://github.com/payloadcms/payload/blob/main/docs/access-control/overview.mdx>):
`## Default Access Control` → `## Base Access Control` → `## The Access Operation` →
`## Locale Specific Access Control`.

**The Admin Panel** (<https://github.com/payloadcms/payload/blob/main/docs/admin/overview.mdx>),
screenshot → `## Project Structure` → `## Admin Options` → `### The Admin User Collection` →
`### Role-based Access Control` → `## Customizing Routes` → `## I18n` → `## Light and Dark Modes`
→ `## Timezones` → `## Toast` → `## Frequently Asked Questions`.

The recurring anatomy: **definition → screenshot → minimal snippet → options table → example →
customisation**. The options table is the load-bearing element; nearly every concept page has one.

### 5. Rosters

**Hand-written throughout. No generated API appendix anywhere on the site.**

Two roster shapes coexist:

- **Roster-as-section.** `Fields` is 23 nav entries, one `Overview` plus **one page per field
  type**, each following the same internal template. It is the largest topic in the docs by a factor
  of nearly two. (The repo carries 24 files there; `docs/fields/slug.mdx` exists without a nav slot.)
- **Roster-as-table.** Config options are markdown tables inside the page they configure, the Text
  Field page's `## Config Options` table carries 21 rows, each an option name, a description, and a
  cross-link.

The REST API is one **1000-plus-line hand-written page** with a custom `<RestExamples>` MDX block
per operation group (`## Collections`, `## Auth Operations`, `## Globals`, `## Preferences`,
`## Custom Endpoints`), no OpenAPI render
(<https://github.com/payloadcms/payload/blob/main/docs/rest-api/overview.mdx>). GraphQL gets a
`GraphQL Schema` page that documents how to *generate* the schema rather than printing it. The
split point is therefore: **nothing is generated into the docs; generation is a thing the reader
runs in their own project**, taught on a page.

### 6. Extension authorship

A **topic, not a section**: `Plugins`, 13 pages, inside the `Ecosystem` group. Two of those pages
are authoring (`Build Your Own`, `Advanced Plugin API`); the other eleven are the overview plus one
page per first-party plugin (Form Builder, Import Export, MCP, Multi-Tenant, Nested Docs,
Redirects, Search, Sentry, SEO, Stripe). Authoring and consuming sit in the same list.

*Building Your Own Plugin*
(<https://github.com/payloadcms/payload/blob/main/docs/plugins/build-your-own.mdx>) runs
`## Plugins Recap` → `## Plugin Template` → `## Testing` → `## Seeding data` → `## Building a
Plugin` → `## Types` → `## Best practices`, where best practices include "Publish your finished
plugin to npm" and "Add `payload-plugin` topic tag", ecosystem hygiene taught as docs.

Note the second authoring surface: `Custom-Components`, 8 pages in the `Features` group, is where
admin-panel extension lives (root components, providers, views, dashboard, edit view, list view).
Payload splits **backend extension** (Plugins) from **admin-UI extension** (Custom Components) into
two different groups.

### 7. Versioning

**The current major is unversioned; one prior major is archived at a path prefix.**
`/docs/*` is current; `/docs/v2/*` returns 200; `/docs/v1/*` returns 404. `topicOrder.ts` holds a
`v2` and a `v3` key, so the archived version keeps its *own* spine rather than being re-pointed at
the current one, the v2 spine has an `Experimental` topic and no `Custom-Components`, `Folders`,
`Jobs-Queue`, `Query-Presets`, or `Trash`.

Experimental status is marked **in the page title**, not by a nav badge: `TypeScript Plugin
(Experimental)` and `Slate (legacy)` carry it in the `title` frontmatter. Migration guides live in
`docs/migration-guide/` (v3, v4) outside the nav.

### 8. Admin-UI documentation

**Screenshots, sparingly, and always in light-and-dark pairs.** 78 image assets under
`public/images/docs` in the website repo
(<https://github.com/payloadcms/website/tree/main/public/images/docs>), against 154 doc files,
well under one image per page. There is no video and there are no annotated/callout figures.

The mechanism is a custom MDX component, `<LightDarkImage srcLight= srcDark= alt= caption=>`, and
the field pages use it as a **visual index of the field-type roster**: `fields/text.png` +
`fields/text-dark.png`, `fields/array.png` + `fields/array-dark.png`, and so on for every type.
That is the single most transferable pattern here. The screenshot is not decoration. It is the
only thing that tells two dozen otherwise similarly-described field types apart.

Currency against a moving UI is not solved by tooling; the images are hand-captured and committed,
and stale pairs are visible in the tree (`.jpg` and `.png` versions of the same shot coexist). The
docs site is itself built on Payload, with docs stored in a `Docs` collection whose block set
includes `lightDarkImage`, `VideoDrawer`, `restExamples`, `banner`, and `card`
(<https://github.com/payloadcms/website/tree/main/src/collections/Docs/blocks>), so the "component
per doc affordance" list is a committed schema, not a convention.

One consequence of that is worth stealing outright: in
<https://github.com/payloadcms/website/blob/main/src/collections/Docs/blocks/lightDarkImage/index.ts>
both `srcLight` and `srcDark` are declared **`required: true`**. The docs schema makes a
single-theme screenshot unpublishable. Payload has turned a screenshot convention into a validation
rule.

### 9. Audience split

**There is no split, because there is no editor documentation.** All five groups are developer
material. `/docs/user-guide` 404s. The `Admin` topic teaches the admin panel entirely from the
config side, project structure, admin options, customising routes, extending timezones, with
nothing on how an editor drafts or publishes.

Payload's answer to the two-audience problem is to serve exactly one audience and let the product
be self-explanatory to the other. For a ticket that asks where the seam sits, Payload's answer is:
there is no seam, because there is no second track.

### 10. Content modelling

**Second topic in the first group**. `Basics → Configuration`, whose first three pages are
*The Payload Config*, *Collection Configs*, *Global Configs*. `Basics → Fields` follows two topics
later with the 23-page field roster. A reader meets "define your content types" on their fifth page
and the exhaustive field roster on their twelfth.

This is the most content-model-forward spine of the six. Payload treats the content model as the
*subject* of the docs rather than one feature among many: `Configuration` + `Fields` alone are 29 of
148 pages, and they are the first thing after the four orientation pages.

---

## Strapi

Source of truth for the spine:
<https://github.com/strapi/documentation/blob/main/docusaurus/sidebars.js>, parsed directly. Two
sidebars are exported, `cmsSidebar` and `cloudSidebar`, surfaced as two top-nav entries ("CMS" and
"Cloud") in
<https://github.com/strapi/documentation/blob/main/docusaurus/docusaurus.config.js>.

### 1. Spine, verbatim and in order

**`cmsSidebar`, 147 pages:**

| # | Category (verbatim) | Pages |
| --- | --- | --- |
| 1 | Getting Started | 8 |
| 2 | Features | 20 |
| 3 | AI | 3 |
| 4 | Content APIs | 26 |
| 5 | Configurations | 27 |
| 6 | Development | 25 |
| 7 | TypeScript | 4 |
| 8 | Command Line Interface | 1 |
| 9 | Plugins development | 28 |
| 10 | Upgrades | 5 |

**`cloudSidebar`, 22 pages:** Getting Started (7), Projects management (5), Deployments (2),
Account management (2), Command Line Interface (1), Advanced configuration (5).

Note the casing is not normalised. "Plugins development" and "Projects management" are
sentence-case while "Getting Started" and "Command Line Interface" are title-case, in the same file.

The first category is the tell. **Getting Started** is `quick-start`, `project-structure`,
`installation`, **Admin panel**, **Content Manager**, **Content Type Builder**, `deployment`,
`billing-portal`. Those three bolded entries are `cms/features/*` documents *promoted into the
on-ramp*: the three admin-UI surfaces are presented as things you learn before you learn anything
else.

### 2. Depth

**Four levels.** `Development` → `Backend customization` → `Guides` → page is the deepest path.
Sub-categories appear in five places: `Features → Strapi plugins`, `Content APIs → REST API` and
`→ Document Service API`, `Configurations → Admin panel` / `Database` / `Guides`,
`Development → Backend customization` / `Admin panel customization`, and `Plugins development →
Basics` / `Admin Panel API` / `Server API` / `Guides`.

Two distinct things earned the extra level:

- **API surfaces that are large enough to be their own manual** (REST API's 12 pages, Document
  Service API's 9, Server API's 9, Admin Panel API's 8).
- **Task guides hung off the concept section they belong to.** Every `Guides` sub-category is a
  bag of "how do I actually do X" pages parked under their parent concept rather than in a global
  tutorials chapter. There are five such `Guides` groups.

One sub-category is not pages at all: `Configurations → Admin panel` is **twelve `type: 'link'`
entries pointing at anchors within a single page** (`/cms/configurations/admin-panel#api-tokens`,
`#audit-logs`, `#rate-limiting`, …). Strapi uses the sidebar to expose a long page's internal
structure without splitting the file. That is a deliberate answer to the roster-splitting question:
keep one file, index it from the nav.

### 3. On-ramp

**A quickstart that is a full tutorial, plus per-page teaching.** `cms/quick-start`
(<https://github.com/strapi/documentation/blob/main/docusaurus/docs/cms/quick-start.md>) runs
`## Part A: Create a new project with Strapi` → `## Part B: Build your content structure with the
Content-type Builder` → `## Part C: Deploy to Strapi Cloud` → `## Part D: Add content to your
Strapi Cloud project with the Content Manager` → `## What's next?`. Parts B and D are entirely
click-through-the-admin-UI walkthroughs. There is no separate tutorial chapter; the quickstart
absorbs the role.

Teaching also appears inline at the head of concept pages, via a committed component: `<Tldr>`,
a two-sentence summary block that opens the page before any prose.

### 4. Page template

The **Feature page** is the most formalised template of the six products surveyed. From
`cms/features/draft-and-publish.md`:

```
frontmatter: title, description, displayed_sidebar, toc_max_heading_level, tags[]
# Draft & Publish
<Tldr> …two sentences… </Tldr>
one-line definition
<IdentityCard>
  Plan · Role & permission · Activation · Environment
</IdentityCard>
<Guideflow lightId="…" darkId="…"/>
## Configuration      ← developer-facing
## Usage              ← editor-facing, screenshot-per-step
### … ### … ### Bulk actions
## Usage with APIs    ← developer-facing again
```

`<IdentityCard>` is a four-slot fact box answering *is this in my plan, what role do I need, is it
on by default, does it work in production*. `<Guideflow lightId= darkId=>` embeds an interactive
product walkthrough, recorded twice for light and dark themes.

Usage counts across `docusaurus/docs` at `main`: **`<Tldr>` 285 times**, effectively once per
page, against 284 doc files; `<ThemedImage>` 150 times; `<IdentityCard>` 19 times (i.e. on the
Features pages and almost nowhere else); `<Guideflow>` in 13 files. The Tldr number is the
important one. The two-sentence summary is a mandatory element of every page, not a flourish
applied to the important ones.

`cms/features/content-type-builder.md` runs `## Overview` → `## Usage` → `### Creating
content-types` → `### Editing content-types` → `### Configuring content-types fields` → **one
`####` per field type, twenty-three of them**, each prefixed with the field's own admin-panel icon
as an inline `<img width="28" src="/img/assets/icons/v5/ctb_text.svg" />` → `### Deleting
content-types`.

### 5. Rosters

**Hand-written, and consolidated rather than split.** The whole field-type roster lives inside the
Content-type Builder page as `####` headings, one long file, indexed by the page's own table of
contents (`toc_max_heading_level: 5` in frontmatter exists to make that work). Compare Payload,
which gives each of its 23 field types a page.

Config options follow the same rule: `cms/configurations/admin-panel` is one page carrying every
admin config key, with the sidebar linking to its anchors (see Depth, above).

The one generated surface is `cms/api/openapi` and the `Documentation` plugin under `Features →
Strapi plugins`. Strapi's answer to API reference is a *plugin that generates an OpenAPI spec in
the user's own project*, documented as a feature, rather than a generated appendix on the docs
site. Same split point as Payload: generation is something the reader runs, not something the docs
site does.

### 6. Extension authorship

**Its own top-level section, and the largest one: `Plugins development`, 28 pages**, 19% of the
CMS docs. Structure: `Marketplace` → `Developing plugins` → `Basics` (3) → `Admin Panel API` (8) →
`Server API` (9) → `Guides` (5) → `plugins-extension`.

The `Admin Panel API` / `Server API` split is the notable move: a plugin author is told, at the
level of the nav, that their plugin has two halves that are developed differently. Admin Panel API
covers navigation & settings, Content Manager APIs, **injection zones**, the Redux store, hooks,
localization, and the fetch client. That is a complete contract for extending a precompiled admin
app, the same problem Plumix solves with manifest-registered plugin chunks.

`Development → Admin panel customization` (8 pages: logos, favicon, locales & translations, rich
text editor, bundlers, theme extension, extension) is a *separate* section for customising the
admin app without writing a plugin. Strapi therefore has **three** extension surfaces in the spine:
customise the admin app, extend the backend, or write a plugin.

### 7. Versioning

**The site does not version. Each major gets its own subdomain.**
`docusaurus/versions.json` is an empty array. The footer links out to `https://docs-v4.strapi.io`
and `https://docs-v3.strapi.io` (labelled "v3 Docs (unsupported)"), and the site title is committed
as `'Strapi 5 Documentation'`. Migration is a spine section (`Upgrades → v4 → v5`, 4 pages) rather
than a footnote.

Unstable APIs are marked by **committed MDX badge components** rendered inline in the heading:
`### Recording the first publication date <FeatureFlagBadge feature="experimental_firstPublishedAt" />`
and `#### Creating content-types with Strapi AI <NewBadge />`. The badge carries the *feature flag
name*, so the marker and the toggle that controls it share an identifier.

### 8. Admin-UI documentation

**The most heavily illustrated of the six, by an order of magnitude.** 803 image assets under
`docusaurus/static/img/assets` against 262 CMS doc files
(<https://github.com/strapi/documentation/tree/main/docusaurus/static/img/assets>), roughly three
images per page. `content-type-builder.md` alone carries 8 embedded images plus 23 inline field-type
icons.

Three mechanisms, all committed components:

1. **`<ThemedImage sources={{light, dark}}>`**, 150 uses; every screenshot exists twice, `foo.png`
   and `foo_DARK.png`. Same solution as Payload's `<LightDarkImage>`, arrived at independently.
2. **`<Guideflow lightId= darkId=>`**, 13 files; an embedded interactive click-through of the real
   UI, again recorded per theme. The component
   (<https://github.com/strapi/documentation/blob/main/docusaurus/src/components/Guideflow.js>)
   mounts two `app.guideflow.com/embed/<id>` iframes and cross-fades them on `colorMode`. This is
   the only product in the survey that embeds a driveable walkthrough rather than a still or a
   video.
3. **`<Icon name="layout" />`** inline in prose, plus a `**Path to configure the feature:**` line
   at the top of each `## Configuration`. The docs name the UI location before describing it.

Currency against a moving UI is handled by volume and by the light/dark pairing convention, not by
automation; there is no screenshot-capture pipeline in the repo. UNVERIFIED: whether Guideflow
recordings are re-captured on a schedule.

### 9. Audience split

**Formerly two sites, now deliberately one, and the merge is documented by a redirect.**
`https://docs.strapi.io/user-docs/intro` returns **308 → `https://docs.strapi.io/cms/intro`**. The
separate content-manager User Guide was collapsed into the developer docs.

The seam now sits **inside the page**, not between sites. On a Feature page, `## Configuration` and
`## Usage with APIs` are developer sections and `## Usage` is the editor section, in one file, in
one nav. Audience is signalled three ways:

- **In the heading structure**, per the template above.
- **In frontmatter `tags`**, `draft-and-publish.md` carries `content manager`, `content type
  builder`, `publishing a draft`, `unpublishing content`, `features`.
- **Occasionally in the page title**, where the split is irreconcilable: the `AI` section is
  literally `Strapi AI for content managers` and `AI for developers and docs` as two pages.

The other split Strapi *does* keep is by **product**, not audience: CMS and Cloud are two sidebars
behind two top-nav tabs. And contributor docs are pushed off-site to `contributor.strapi.io`.

### 10. Content modelling

**Sixth page of the docs, inside `Getting Started`**. `Content Type Builder`, promoted out of
`Features` into the on-ramp, and taught as an admin-UI walkthrough with the full 23-type field
roster inside it. `Part B` of the quickstart is "Build your content structure with the Content-type
Builder", so the reader models content on their *second* page if they follow the quickstart.

Strapi's position is that the content model is learned **through the admin UI first** and through
config second (`cms/backend-customization/models` sits at depth 3 under `Development`). That is the
inverse of Payload, where the model is config-first and the admin panel is a rendering of it.

---

## Sanity

Sanity publishes no public docs-content repo, but **the docs site is itself a Sanity project and its
content dataset is publicly readable.** The site preconnects to `https://3do82whm.api.sanity.io` and
images resolve from `cdn.sanity.io/images/3do82whm/next/`. The nav source of truth is therefore
queryable directly: `*[_type=="docsNavSection"]` returns the actual nav documents. Findings below
come from that dataset, cross-checked against the rendered masthead of <https://www.sanity.io/docs>,
the sitemap (616 URLs), and the docs' own first-party section index at
<https://www.sanity.io/docs/llms.txt>.

### 1. Spine, verbatim and in order

**Sanity has no single global sidebar.** The spine lives in a horizontal masthead of six dropdown
menus (`<nav aria-label="Main">`), and the left sidebar is **scoped to whichever section you are
in**. Two nav widgets, not one tree.

Masthead groups and their children, verbatim and in order:

| # | Group (verbatim) | Children (verbatim, in order) |
| --- | --- | --- |
| 1 | **Getting started** | Overview · Platform introduction · AI coding agents · AI app builders · Next.js quickstart · Nuxt.js quickstart · Astro quickstart · React Router quickstart · Studio quickstart |
| 2 | **Platform** | Build with AI · Content Lake · Functions · APIs and SDKs · Agent Actions · Visual Editing · Blueprints · Platform management |
| 3 | **Apps** | Dashboard · Studio · Canvas · Media Library · App SDK · Content Agent |
| 4 | **Integrations** | Next.js · Astro · APIs and SDKs |
| 5 | **Reference** | HTTP API · CLI · Libraries · Specifications |
| 6 | **Resources** | Changelog · User guides · Developer guides · Courses and certifications ↗ · Join the community ↗ · Templates ↗ |

Page counts come from `llms.txt`, which the docs publish themselves, section titles verbatim, with
their own counts:

`Studio` 123 · `Help articles` 88 · `Content Lake (Datastore)` 64 · `Developer guides` 60 ·
`CLI reference` 44 · `APIs and SDKs` 36 · `HTTP API Reference` 25 · `Visual Editing` 25 ·
`Media Library` 20 · `Blueprints` 19 · `User guides` 18 · `Agent Actions` 17 · `App SDK` 16 ·
`Functions` 16 · `Platform management` 14 · `Build with AI` 12 · `Use Sanity with Next.js` 12 ·
`Specifications` 10 · `Use Sanity with Astro` 8 · `Canvas` 7 · `Getting started` 6 ·
`Astro quick start` 5 · `Content Agent` 5 · `Nuxt.js quick start` 5 ·
`React Router (Remix) quick start` 5 · `Next.js quick start` 4 · `Sanity Studio quick start` 4 ·
`Dashboard` 3 · `Developer Documentation` 3 · `Libraries` 2 · `Editorial Workflows` 1.

**677 page-slots across 31 sections.** From the CMS: **32 `docsNavSection` documents, 139 sidebar
groups, 817 sidebar links** (817 > 677 because pages are cross-listed; see point 9).

Three sections are live but unreachable from the masthead: `Help articles` (88 pages at `/docs/help`,
one flat ungrouped list of error-message and troubleshooting articles, reached from in-product errors
and search), `Editorial Workflows` (35 sidebar links, 1 published page, an unlaunched area), and
`Developer Documentation` (a metadata bucket overlapping `Getting started`).

**This is a product-shaped spine, not a task-shaped one.** `Apps` lists six shipped applications;
`Platform` lists eight platform services. A reader must know which *product* their question belongs
to before they can navigate. Sanity earned that by genuinely shipping six apps. Plumix ships one
admin, copying a portfolio spine without a portfolio produces a site organised around the vendor's
org chart.

### 2. Depth

**Sidebar nesting is exactly 2, group → page, proven from the CMS, not inferred:** no
`docsNavArticleItem` carries a `children` array, and a recursive depth walk over all 32
`docsNavSection` documents returns max depth 2.

The *apparent* depth is 4, because the two nav widgets stack: masthead group (`Apps`) → section
(`Studio`) → sidebar group (`Plugins`) → page (`Developing plugins`). What earned the extra levels is
**the size of the product, not topical subdivision**. `Studio` alone carries 126 sidebar links; rather
than deepen a global tree, Sanity gave the section its own sidebar.

Studio's 11 groups, verbatim with counts: `Setup and development` (10) · `Configuration` (13) ·
`Block Content (Portable Text)` (7) · `Studio customization` (21) · `Workflows` (12) ·
`Structure builder` (11) · `Plugins` (7) · `AI Assist` (4) · `User guides` (8) ·
`Studio schema reference` (20) · `Studio reference` (13).

This is the survey's most important structural lesson for a flat-by-policy site: **you can hold a
two-level sidebar at 677 pages if you split the nav into a global product switcher plus a
section-scoped tree.** Directus, which kept one tree, went four deep and lost scannability.

### 3. On-ramp

**Both, and tutorials get their own page layout.** The docs content model carries an explicit
`layout` field with enum `"default" | "steps"`, and **9 articles use `layout: "steps"`**,
`setting-up-your-studio`, `defining-a-schema`, `querying-content-with-groq`,
`displaying-content-in-next-js`, `displaying-content-in-an-astro-front-end`,
`displaying-content-in-a-react-router-front-end`, `displaying-content-in-nuxt-js`,
`deploying-studio-and-inviting-editors`, `sdk-quickstart`.

**Steps pages render with no left sidebar at all.** The nav element is present but empty and hidden
via `has-[[data-sidebar-content]:empty]:hidden`. The right-rail TOC stays. A tutorial removes the
navigation so the reader cannot wander off the path.

Six framework quickstarts **share the same step pages, swapping only the middle step**:
`next-js-quickstart` is *Setting up your studio → Defining a schema → Displaying content in Next.js →
Deploying Studio and inviting editors*; `sanity-studio-quickstart` swaps step 3 for *Querying content
with GROQ*. Six on-ramps, four pages of unique content each, one shared spine. That is the cheapest
framework-fork mechanism in the survey, compare Directus's 15 separate framework hubs.

There is **no tutorial chapter inside the docs**. Long-form courses are a separate site,
<https://www.sanity.io/learn> (3 tracks, 12+ courses, 139 lesson pages).

Teaching does appear inline at the head of concept pages: `/docs/studio/configuration` leads with
`## Minimal Studio configuration example` before any reference material. **526 of 657 articles (80%)
contain a code block**, and 129 use a `docsCardCollection` block, the curated card grid used on
section landing pages to re-cut the sidebar into a reading order. `/docs/studio`'s grid runs
**`The basics` → `Get ready for production` → `Customize the Studio` → `Bells and whistles`**. The
sidebar is a reference index; the landing page is a learning path. For a 123-page section, that
separation earns its keep.

### 4. Page template

Page chrome, in order: section eyebrow → `Last updated <date>` → `<h1>` → **`Copy article`**
split-button → one-sentence deck → body → footer `Previous` / `Next` → `Was this page helpful?`;
right rail `ON THIS PAGE` listing H2 and H3 only.

The `Copy article` dropdown is an AI-affordance cluster: *Copy article, as Markdown optimized for
LLMs* · *Open in ChatGPT* · *Open in Claude* · *Copy MCP install command* · *Connect to Cursor* ·
*Connect to VS Code*. Every page is also served at `<url>.md` or via `Accept: text/markdown`, and
each carries a banner telling agents so.

**Introduction to schemas** (<https://www.sanity.io/docs/apis-and-sdks/introduction-to-schemas>),
`## What is a schema?` → `## Where schemas live` → `## How to design schemas` →
`## Your schemas will change` → `## Anatomy of schemas` (`### Content model or schema`,
`### Document types`, `### Field types`, `#### Field hoisting`) →
`## Example: Your first schema type` → `## Advanced schema features` (`### Schema deployment`,
`### Schemas for Media Library (Aspects)`) → `## Conclusion` → `#### Related articles`.

**Configuration** (<https://www.sanity.io/docs/studio/configuration>),
`## Minimal Studio configuration example` → `## Property callback functions` →
`## Commonly used configuration properties` (`### Workspace properties`, `### Schema`,
`### Plugins`, `### Tools`, `### Form`, `### Document`, `### Auth`) →
`## Related changelog entries`.

**Perspectives** (<https://www.sanity.io/docs/content-lake/perspectives>),
`## Look at your content from a different point of view` → `## Example output from different
perspectives` → `## Perspective layers` → `## Related changelog entries`.

Template: **concept prose → worked example → reference table → auto-generated
`## Related changelog entries` and/or hand-curated `#### Related articles`.** The changelog block is
machine-assembled from 582 `apiChange` and 756 `apiVersion` documents in the dataset, so every
concept page ends with the *history* of the thing it just explained, generated.

Callout vocabulary, counted across `llms-full.txt` (4.99 MB): **913 callouts** with *named* titles,
`WARNING` 388 (of which **223 titled "Gotcha"**, 22 "Experimental feature", 3 "Deprecation notice",
2 "Public beta"), `NOTE` 306 (5 "Paid feature", 12 carrying an author byline on community guides),
`TIP` 294 (**109 "Protip"**, 18 "Pro tip"), `CAUTION` 10 (7 "Known issue"). A house callout
vocabulary of that size, applied that consistently, is itself an IA decision.

### 5. Rosters: three mechanisms, three different split points

**(a) HTTP API, generated from OpenAPI, hand-written lede.** The 25 pages under `Reference → HTTP
API` are **not `article` documents**; they are a separate `openApiReference` document type with
exactly two fields: `content` (hand-written Portable Text) and `specification` (a literal OpenAPI
3.1.1 YAML document stored as a code field). Rendered output on `/docs/http-reference/query`: hand
lede, then generated `## Authentication` / `## Endpoints` / `#### Path parameters` /
`#### Query parameters` / `#### Request body` / `#### Responses` / `## Schema Reference`. The intro
prose appears twice on the page, once authored, once from the OpenAPI `info.description`, which is
the visible seam where two pipelines splice. No "Try it" console.

**(b) CLI, fully generated.** All 44 `cli-reference` articles are a single code block of verbatim
`sanity <cmd> --help` output (`USAGE` / `FLAGS` / `DESCRIPTION` / `EXAMPLES`). Proof of automation:
ten of them share an identical `_updatedAt` of `2026-06-16T15:28:25Z`, one batch transaction.

**(c) Schema types, hand-written, linking out to generated typedoc.** The 19 field-type pages use a
`propertiesTable` block (72 articles use it), and the raw block shows each property is authored
Portable Text (`{_type:"property", name, isRequired, explanation[]}`), **not** derived from
TypeScript. Each page instead links out per-section:
`## Options ([ArrayOptions](https://reference.sanity.io/sanity/index/ArrayOptions/))`.

**(d) The generated TypeScript reference is a separate site.** <https://reference.sanity.io>, TypeDoc,
built by the public repo <https://github.com/sanity-io/reference-api-typedoc>, whose README states
the pipeline: TypeDoc emits JSON from library source → a GitHub Action uploads it to Sanity → the
reference site renders it. 1,183 `api.symbol` and 152 `api.release` documents; page titles carry the
package version.

**(e) The GROQ spec is off-site too**. `Reference → Specifications` links out to
<https://spec.groq.dev>, keeping 7 hand-written GROQ pages as the teaching layer over the formal
spec.

The pattern across all five: **Sanity hand-writes the teaching layer and links out to the generated
layer, rather than embedding generated output in the docs.** Payload, Strapi and EmDash generate
nothing; Directus generates the HTTP API reference in-site. Sanity is the only one that keeps a generated
reference alive *and* keeps it out of the docs IA.

### 6. Extension authorship

**A group inside the product it extends, no separate site, no top-level section.** Split across
three sibling groups in the Studio sidebar:

- **`Plugins`** (7). Introduction · Installing and configuring plugins · Developing plugins ·
  Publishing plugins · Internationalizing plugins · Reference · Official plugins repo ↗
- **`Studio customization`** (21). Custom components for Sanity Studio · Custom authentication ·
  Custom asset sources · Diff components · Form components · How form paths work ·
  Focus and UI state in custom inputs · Real-time safe patches for input components · Sanity UI ·
  Create a custom Studio tool · Tools common patterns · Theming Sanity Studio · …
- **`Studio reference`** (13). Asset Source · Configuration · Document · Document Badges ·
  Document Actions · Form · Form components API reference · Hooks · Structure tool ·
  Studio components reference · Tools · Initial Value Templates API reference · Studio API reference ↗

**The teaching/reference pairing is deliberate and repeated: every customization concept page has a
matching `…-api-reference` page in `Studio reference`.** That is a different resolution of
teach-then-enumerate than Laravel's. Laravel puts both halves in one file; Sanity puts them in two
files in two groups and links them. At 21 customization pages, the split is probably right.

`Developing plugins` closes with `## Submit your plugin to the Exchange`; the plugin directory itself
lives on the marketing site at `/exchange`, not in docs.

### 7. Versioning

**The docs site does not version.** No version segment in any of the 616 sitemap URLs, no switcher,
`/docs/v2` → 404. When Studio went v2 → v3 the old tree was **deleted, not archived**, and replaced
by two help articles (`/docs/help/studio-v2-vs-v3`, `/docs/help/migrating-from-v2`).

**What versions instead is the API, by date.** Every request pins an ISO date
(`apiVersion: '2026-07-28'`, URL `…/v2026-06-24/data/query/…`), Stripe-style. Unstable APIs get the
special API version **`X`**, documented as *"used to test experimental changes… it may also cause
data loss."* Deprecated versions signal over the wire via `X-Sanity-Warning` and
`X-Sanity-Deprecated: true`; removed versions return `410`. **Stability is a property of the API
contract and is enforced at the wire, not annotated in the docs.** That is the strongest version
story in the survey and the one least dependent on docs hygiene.

**Marking unstable APIs in the docs, though, is where Sanity has a real defect.** Status is baked
into title strings, group label `Embeddings index (deprecated)`, page titles
`Scheduled publishing (deprecated)`, `Third-Party Login (Deprecated)`,
`Experimental feature: Spaces`, plus prose callouts (22 `WARNING` titled "Experimental feature",
2 "Public beta", 3 "Deprecation notice").

But **there is a first-class `experimental: true` boolean on the `article` type, set on 16 articles,
and it is never rendered.** The string "experimental" appears zero times in the served HTML of
`/docs/apis-and-sdks/sanity-typegen`, which carries the flag. The field is editorial metadata that
never reaches the reader. Worth recording as a cautionary note: **a stability flag that no template
renders is worse than no flag, because it makes the team believe the problem is solved.**

### 8. Admin-UI documentation

**Screenshots with descriptive alt text and italic captions. No annotated figures, essentially no
video.** Counted from the dataset (`content[_type=="image"]` vs `content[_type=="muxVideo"]`):

| Section | Articles | Image blocks | Video blocks |
| --- | --- | --- | --- |
| Studio | 134 | 172 | 0 |
| Developer guides | 60 | 163 | 0 |
| Canvas | 15 | 78 (5.2/article) | 1 |
| **User guides** | **9** | **76 (8.4/article)** | 0 |
| Visual Editing | 25 | 34 | 1 |
| Media Library | 24 | 28 | 0 |
| Dashboard | 7 | 21 | 0 |
| HTTP API / CLI / Specifications / Libraries | 0 / 44 / 7 / 2 | **0 / 0 / 0 / 0** | 0 |

Site-wide: **638 image blocks across 183 articles**, 16 `muxVideo` blocks across 11 articles, 7
mermaid diagrams. The distribution is the finding: **the editor-facing section is the most heavily
illustrated per page in the entire site (8.4 images per article), and the reference sections carry
literally zero.** Directus reaches the same allocation by a different route. Two independent teams
concluded that images are for the audience that cannot read a config file.

Figure convention, raw:

```markdown
![The Create a new release dialog with fields for release time, title, and description](cdn.sanity.io/images/3do82whm/next/<hash>-1410x962.jpg)
*Create a new release*
```

Alt text describes the UI *state*; the italic line below is the caption. No callout numbers, no drawn
arrows. **Images crop tightly to the widget under discussion**, `774x758` for a toolbar dropdown,
`846x400` for a popover menu, rather than full-window shots. That is the durability mechanism: a
cropped dropdown outlives a redesign of everything around it. Directus captures full 3840×2160
windows and consequently invalidates every screenshot on any chrome change.

**Currency is modelled, not automated.** The `article` type carries a **`lastReview`** field,
populated on **248 of 657 articles (38%)**, and a **`v3State`** enum (`"ready" | "revise"`), an
editorial re-review queue baked into the content model. The reader-facing half is the
`Last updated <date>` stamp on every page. 72 articles are flagged `hidden: true`, a soft-unpublish
lane rather than deletion. And 93 `reusableDocsContentEmbed` blocks provide transclusion, so repeated
instructions are single-sourced.

Long-form video lives off-site as the "Sanity 101" YouTube playlist; the one heavy in-docs use is a
Mux player under the deck of `/docs/defining-a-schema`.

### 9. Audience split

**One site, one nav, one URL space, separated by section, and then deliberately re-mixed.**

The editor surface is <https://www.sanity.io/docs/user-guides>, reached from masthead
`Resources → User guides`. Its deck names the audience: *"Practical, easy-to-follow guides that help
content teams work efficiently across official Sanity applications."* Its groups are product-shaped:
`Dashboard` · `Sanity Studio` · `Media Library` · `Canvas` · `Manage` · `Content Agent`, each led by
a quick-start cheatsheet.

**The mechanic worth stealing is cross-listing with provenance.** `User guides` counts 18 pages, but
only 9 of them *live* at `/docs/user-guides/*`. The other 9 are borrowed,
`/docs/studio/comments`, `/docs/studio/tasks`, `/docs/studio/compare-document-versions`,
`/docs/canvas/writing`, `/docs/media-library/interface`, `/docs/dashboard/dashboard-introduction`,
`/docs/visual-editing/preview-and-page-building`, and others. The borrowing runs both ways: the
Studio sidebar has a group literally named `User guides` (8 entries) that reaches back out into
`/docs/user-guides/*`.

Borrowed entries render with a small grey origin tag beneath the link:

```html
<a href="/docs/user-guides/field-copy-and-paste"><span>Copy and paste fields</span></a>
<span class="text-details-sm pb-6 text-fg-dim">User guides</span>
```

The same tag carries links between every pair of sections. `APIs and SDKs` (6 uses),
`Visual Editing` (5), `Studio` (5), `HTTP API Reference` (5), `Content Lake` (4), `CLI reference`
(4), `User guides` (3). **A page is authored once and borrowed everywhere, with its home section
shown so the reader knows they are crossing a boundary.** That is how a two-level sidebar survives
677 pages and two audiences without duplication and without a filter toggle. It is the single most
transferable audience-split mechanism in this survey.

Adjacent surfaces, none of which is an editor help centre: `/learn` (courses, developer-targeted);
`sanity.io/help` (a support-contact page, not a knowledge base); `/docs/help` (88 troubleshooting
articles, unlinked from any nav, developer-facing); `/exchange` (community plugin directory).

One smaller device: install snippets on the docs landing page carry **`For humans` / `For agents`**
tabs, an audience toggle scoped to a code block rather than to the nav.

### 10. Content modelling

**`Platform → APIs and SDKs → Schemas`, the first sidebar group of the second masthead group.**
One masthead hop and one group from the root. Confirmed against the docs' own section index
(<https://www.sanity.io/docs/llms/apis-and-sdks.txt>), where the section opens:

| Title (verbatim) | URL |
| --- | --- |
| Introduction to schemas | `/docs/apis-and-sdks/introduction-to-schemas` |
| Naming things | `/docs/apis-and-sdks/naming-things` |
| Attribute limit | `/docs/content-lake/attribute-limit` *(borrowed)* |
| Schema | `/docs/studio/schema-types` *(borrowed)* |
| Schema Deployment | `/docs/apis-and-sdks/schema-deployment` |
| Aspects schema for Media Library | `/docs/media-library/create-aspect` *(borrowed)* |

**The split is the point, and it is clean: conceptual "how to model content" lives with the APIs,
platform-level, framework-agnostic, tool-agnostic, while the exhaustive field-type roster lives with
the Studio, because a field type is a tool-level concern.** The two link to each other from both
directions via the borrowing mechanism. Sanity is the only product in the survey that separates
*modelling doctrine* from *field roster* and still keeps them one click apart.

It is reachable four other ways, all early:

1. **Quickstart step 2 of 4**, `Defining a schema`, shared verbatim by all six framework
   quickstarts. Install → define schema → query → deploy.
2. **Docs home, `Popular destinations`, second card**, *"How schemas work: Learn about schema types
   and how to create content models."*
3. **Docs home, `Reference` block, first tile**, *"Schema: A schema describes the types of documents
   and fields editors may author in a Sanity Studio workspace."*
4. **Studio landing, `The basics`, second card**. *"Schema types."* Plus Studio sidebar
   `Configuration → Schema and forms`, third item in Studio's second group.

The reference tier is Studio's `Studio schema reference` group: 1 config page plus 19 type pages,
`Array`, `Block`, `Boolean`, `Cross Dataset Reference`, `Date`, `Datetime`, `Document`, `File`,
`Geopoint`, `Global document reference`, `Image`, `Number`, `Object`, `Reference`, `Slug`, `Span`,
`String`, `Text`, `URL`, each at `/docs/studio/<name>-type` with `## Properties` and `## Examples`.

---

## Directus

Source of truth for the spine:
<https://github.com/directus/docs/blob/main/shared/utils/docsSections.ts>, the top two tiers are a
**hand-written TypeScript constant**, not derived from the file tree. Below that, order comes from
numeric filename prefixes (`01.`, `02.`) in `content/`, with per-directory `.navigation.yml` files
overriding labels (most are zero bytes, so the folder name is title-cased). The site is Nuxt 4 +
`@nuxt/content`. Live at <https://directus.com/docs> (directus.io/docs 301s there). Sitemap: **390
URLs**.

### 1. Spine, verbatim and in order

Directus has **two nav tiers above the section**: a group tab bar and, inside a group, a section
bar. Verbatim from `docsGroups`:

**Groups (4):** `Docs` → `API` → `Tutorials` → `Licensing`.

**Sections inside `Docs`**, in `sectionIds` order, with page counts from the sitemap:

| # | Label (verbatim) | Entry URL | Pages |
| --- | --- | --- | --- |
| 1 | Get Started | `/getting-started/overview` | 10 |
| 2 | Guides | `/guides/data-model/collections` | 123 |
| 3 | Hosting | `/cloud/getting-started/introduction` | 22 |
| 4 | Configuration | `/configuration/intro` | 20 |
| 5 | Frameworks | `/frameworks` | 73 |
| 6 | Community | `/community/overview/welcome` | 16 |
| 7 | Releases | `/releases` | 6 |

Other groups: `API Reference` 35 pages, `Tutorials` 79, `Licensing` 3. A retired eighth section
(`label: 'Reference'`, `group: legacy-reference`) sits commented out in the same file.

`Guides`, the section that carries the product, has 14 second-level groups: `Data Model` (5),
`Content` (15), `Auth` (8), `APIs` (8), `Files` (5), `Flows` (4), `Realtime` (4), `Insights` (2),
`Extensions` (21), `Environment Sync` (7), `Deployments` (2), `AI` (19), `Integrations` (22),
`Security` (1).

### 2. Depth

**Four levels below the section header** at maximum (URL depth 5), reached by exactly two pages:
`/docs/guides/ai/mcp/local-mcp/tools` and `/docs/guides/ai/mcp/local-mcp/prompts`.

Depth distribution over the 390 sitemap URLs: 1 segment = 5, 2 = 102, **3 = 231**, 4 = 49, 5 = 2.
Three is the norm (section / group / page). Level 4 is earned by feature clusters big enough to
need their own overview page, `extensions/api-extensions/*` (6), `extensions/app-extensions/*` (9),
`ai/mcp/*` (9), `content/visual-editor/*` (4). Level 5 is earned only by a distinct *deployment mode*
of one feature with its own rosters.

Directus is the deepest site in the survey and the least flat. Given Plumix's map explicitly names
flatness as its anti-scatter mechanism, Directus is the cautionary case: 390 pages under four tiers
means no reader ever holds the shape of the site in their head.

### 3. On-ramp

**Both, plus a third rail.** `Get Started` is a **10-page sequential tutorial chapter** chained by
explicit `## Before You Start` / `## Next Steps` headings: Overview → Create a Project → Configure a
Data Model → Use the API → Authenticate a User → Upload & Access Files → Create a Flow → Connect to
Realtime Data → Resources & Links (+ Accessibility). Note a live ordering bug, `10.accessibility.md`
sorts second because Nuxt sorts numeric prefixes as strings.

Quickstarts are **scoped, not global**: only three pages are titled Quickstart
(`/guides/extensions/quickstart`, `/guides/environment-sync/quickstart`,
`/guides/connect/json/quickstart`). The global install moment lives on the docs landing page.

The third rail is `Frameworks`: 15 framework hubs (Next.js, Nuxt, Astro, SvelteKit, React, Angular,
Laravel, Django, Flask, Spring Boot, Flutter, Swift, Kotlin, Eleventy, SolidStart), each with a
`Start Here` block driven by `section: start-here` frontmatter. The on-ramp forks by the reader's
*frontend stack*, directly relevant to Plumix, whose readers arrive from Astro and WordPress.

Teaching does appear inline at the head of concept pages, aggressively: 20 pages embed a Directus TV
video before the first `##`, including 7 of the 10 Get Started pages.

### 4. Page template

**No enforced template.** Body `#` headings exist on only 25 of 375 markdown files (the title comes
from frontmatter). Two patterns coexist:

**(a) Loose concept/task page.** `/docs/guides/data-model/collections`, `## Creating Collections` →
`### Name` → `### Primary Key` → `## Configuring Collections` → `### Collection Setup` →
`### Content Versioning` → `### Live Preview` → `### Accountability` → `### Sorting` →
`### Duplication` → `### Archive Settings` → `### Advanced Field Creation Mode` →
`## System Collections` → `## Existing Database Tables`. Only 28 of 123 guides pages (23%) close
with `## Next Steps`.

**(b) Rigid extension-authoring template.** Every app-extension page uses one skeleton with the noun
swapped: `/docs/guides/extensions/app-extensions/interfaces`, `## Interface Entrypoint` →
`### Entrypoint Example` → `### Properties` → `## Interface Component` → `### Component Example` →
`### Props` → `### Emits`; `…/layouts`, `## Layout Entrypoint` → `### Entrypoint Example` →
`### Properties` → `## Layout Component` → `### Component Example` → `### Props` → `### Emits`.
Displays, Panels and Modules follow identically.

The lesson: **Directus enforces a template exactly where the content is a roster of same-shaped
things, and nowhere else.** That is defensible, and is the pattern Plumix's hook / block / field
rosters need.

### 5. Rosters: hybrid, with a hard split

**Generated: the HTTP API, and only the HTTP API.** `scripts/generate-api-reference.ts` imports
`@directus/openapi` at build time (`"build": "node scripts/generate-api-reference.ts && nuxt
build"`), bundles per-tag JSON, pre-highlights code with Shiki, and renders through **bespoke Vue
components** (`ApiEndpoint.vue`, `ApiParams.vue`, `ApiResponseExample.vue`, `ApiCodeSamples.vue`),
not Scalar, not Redoc, not Stoplight. The spec carries 34 tags / 135 paths / 246 operations,
producing 34 tag pages. Code samples switch between SDK / REST / GraphQL from `x-codeSamples`, and
the choice persists in user preferences.

**Hand-written: everything else.**

- Field types, one 24-row markdown table under `## Types` on `/docs/guides/data-model/fields`.
- Interfaces (form controls), `/docs/guides/data-model/interfaces`, a **single 665-line page**
  with 5 `##` groups, 40 `###` entries, and **42 screenshots**. The largest hand-maintained roster
  on the site, and the closest analogue to Plumix's field-type roster.
- Environment variables, the whole `Configuration` section, 20 pages, **393 backticked variable
  rows** across markdown tables (`security-limits.md` 94, `auth-sso.md` 68, `files.md` 53).
- SDK, **not** generated: one 457-line hand-written page, with `nuxt.config.ts` stating outright
  that "The @directus/sdk package reference is in the source repository."

**Split point, stated plainly. Directus generates the HTTP reference and writes everything else by
hand: types, interfaces, env vars, SDK, CLI.** This is the sharpest articulation of the
generate-vs-write boundary in the survey, and it lands on the same side as Plumix's map already
does.

### 6. Extension authorship

A **section within a section**: `Guides → Extensions`, 21 pages, rooted at
`/docs/guides/extensions/overview`. Sidebar verbatim: `Overview` · `Quickstart` · `API Extensions` ·
`App Extensions` · `Bundling Extensions` · `Marketplace` · `CLI`.

- `API Extensions` (6): API Extensions Overview, Event Hooks, API Endpoints, Flow Operations,
  Services, Sandbox
- `App Extensions` (9): App Extensions Overview, Item Page Interfaces, Inline Displays, Collection
  Page Layouts, Dashboard Panels, Custom Modules, Custom Themes, UI Library, Composables

The same server/admin split Strapi makes, under different names. Worth noting: **the page titles are
user-facing nouns, not type names**. "Item Page Interfaces", "Collection Page Layouts", "Inline
Displays". An extension author is told what the thing *is on screen*, not what the registry calls it.

A further 22 community-written extension tutorials live separately at `/docs/tutorials/extensions`,
first-party reference and community tutorial are kept in different groups.

### 7. Versioning

**The site does not version.** No switcher, no versioned URLs, no `/v11/` prefix in the 390-URL
sitemap; `nuxt.config.ts` states "This documentation covers the latest version of Directus."
Version change is handled *as content* instead: a `Releases` section with a monthly changelog and
`/docs/releases/breaking-changes/{version-10,version-11,version-12}`.

**Unstable APIs get no nav treatment at all.** Zero `badge:` keys in any `.navigation.yml` or
frontmatter; no beta component. Instability is signalled only inline, `_(deprecated)_` italics in
property tables and `::callout{color="warning"}` blocks (88 of 419 callouts). A currently-beta
feature such as the Visual Editor has four fully documented pages with no beta marker anywhere in
the nav. This is the weakest stability story of the six and should not be copied.

### 8. Admin-UI documentation

**The heaviest screenshot investment in the survey, and it is deliberately unannotated.** 769 files
in `public/img` (398 webp, 282 png, 21 gif, 5 mp4) and **747 image references across 375 markdown
pages**.

Per page: `/docs/guides/data-model/interfaces` 42 images / 4,820 words, one screenshot per
interface, exactly Payload's field-roster move at four times the scale;
`/docs/guides/flows/operations` 15; `content-versioning` 12; `insights/panels` 11;
`content/translations` 10.

Section averages tell the strategy: guides 1.9 img/page, tutorials 3.1, frameworks 3.4, cloud 0.8,
configuration 0.2, and **community, self-hosting and licensing at 0.0**. The image budget goes
almost entirely to the Data Studio; the developer-only sections are prose.

Capture is standardised, 100 webp files are exactly 3840×2160 and 49 are 1920×1080, i.e. 2× retina
full-window light-theme captures, but carries **no arrows, callout boxes, or numbered hotspots**.
The pointing is done by **alt text** instead: *"The filter popup open on a collection page, with the
field list showing a JSON function entry under the Metadata field."* That is a real technique worth
noting: it survives redesign better than a burned-in annotation and it is accessible for free.

Video: 30 `::video-embed` uses across 20 pages, each resolving a `videoId` against a live Directus
instance at `tv.directus.app/items/episodes/…`. The docs consume Directus TV *as an API*, which is
a nice piece of dogfooding.

**Currency is manual and unmanaged.** No Playwright, Puppeteer, or capture script in the repo.
`.github/workflows/docs-checks.yml` gates only `typecheck:scripts`, `stable-ids:check`, and
`redirects:check`, nothing checks image freshness. Screenshots are refreshed opportunistically
inside feature PRs. Evidence of drift: the newest images are hand-named PNGs (`json_filter.png`)
while the older corpus is UUID-named webp, so the standardised pipeline appears to have lapsed.

### 9. Audience split

**One site, one nav, interleaved, and the personalization layer deliberately does not touch nav.**

Inside `Guides`, developer and non-developer material sit side by side, distinguished only by
subject: user-facing are `Data Model` (5), `Content` (15: Explore, Item Page, Layouts,
Import/Export, Live Preview, Content Versioning, Translations, Visual Editor, Collaborative
Editing), `Insights` (2), most of `Flows`; developer-facing are `APIs` (8), `Extensions` (21),
`Realtime` (4), `Environment Sync` (7), `Deployments` (2), `Security` (1), plus all of
`Configuration`, `Frameworks` and `API Reference`; mixed are `Auth` (8), `Files` (5), `AI` (19).

The interesting part is what Directus built and then chose not to wire to the sidebar.
<https://github.com/directus/docs/blob/main/app/utils/roles.ts> defines exactly two roles:

```ts
{ slug: 'developer',     label: 'Developer',     description: 'Show code-first content and technical detail.' },
{ slug: 'non-developer', label: 'Non-Developer', description: 'Focus on UI workflows and concepts.' },
```

…alongside a three-level experience axis. But `useUserPreferences` is imported by only five files,
`HomePersonalized.vue`, `InlinePersonalize.vue`, `SettingsDrawer.vue`, `useDocsSearch.ts`,
`ApiCodeSamples.vue`. It reorders the **homepage**, biases **search**, and picks the default
**code-sample language**. **The sidebar is byte-identical for both roles.**

That is the most instructive audience-split datum in the survey: a team that had every incentive to
build a filtered nav, built the role model, and then applied it to entry points rather than to
structure. The only real seam is the group tab bar, crossing into `API` swaps the whole layout
(`app/layouts/api.vue`), and `Tutorials` uses `app/layouts/tutorial.vue`.

### 10. Content modelling

**First and unmissable.** `Data Model` is the first group inside `Guides`, and `docsSections.ts`
sets the section's own entry point to `to: '/guides/data-model/collections'`, clicking `Guides` in
the section bar lands the reader directly on Collections. It is also page 3 of 10 in `Get Started`.

| Title | URL |
| --- | --- |
| **Configure a Data Model** (`## Creating a Collection` → `## Creating Fields` → `## Configuring a Relationship` → `## Next Steps`, opening with a video) | `/docs/getting-started/data-model` |
| **Collections** | `/docs/guides/data-model/collections` |
| **Fields** | `/docs/guides/data-model/fields` |
| **Item Page Interfaces** (nav label `Interfaces`) | `/docs/guides/data-model/interfaces` |
| **Rich Text** | `/docs/guides/data-model/rich-text` |
| **Relationships** | `/docs/guides/data-model/relationships` |

The landing page reinforces it: the `## How it works` grid names three concepts: Data model,
Permissions, Flows. The first links to `/guides/data-model/collections`. Directus makes the
content model both the first thing in the tutorial and the default landing page of the main section.
No other product in the survey does both.

---

## Statamic

Source of truth for the spine: <https://github.com/statamic/docs>, default branch **`6.x`**. The
sidebar is rendered by
<https://github.com/statamic/docs/blob/6.x/resources/views/partials/nav_contents.antlers.html>,
which calls `{{ nav:collection:pages }}`, so the nav source of truth is the Pages collection
structure tree at
<https://github.com/statamic/docs/blob/6.x/content/trees/collections/pages.yaml>. (The
`content/trees/navigation/*.yaml` files are dead 5.x leftovers, no 6.x view references them and
several of their `entry:` UUIDs no longer resolve.) The rendered sidebar was independently parsed
from <https://statamic.dev/content-modeling/collections> and matches the tree exactly.

Statamic is the docs site whose own CMS is Statamic, so the docs *are* a content model: 631 entries
across nine collections, pages 171, modifiers 196, tags 97, variables 59, fieldtypes 47, tips 35,
resource_apis 13, troubleshooting 10, widgets 3.

### 1. Spine, verbatim and in order

| # | Section (verbatim) | Pages | First page |
| --- | --- | --- | --- |
| 1 | Getting Started | 10 | Learn Statamic → Requirements |
| 2 | Content Modeling | 15 | Overview |
| 3 | Control Panel | 26 | Overview |
| 4 | Frontend | 18 | Overview |
| 5 | Advanced Topics | 11 | CLI |
| 6 | Fieldtypes | 5 | Overview |
| 7 | Tags | 4 | Overview |
| 8 | Variables | 2 | Overview |
| 9 | Modifiers | 3 | Overview |
| 10 | Widgets | 3 | Overview |
| 11 | Addons | 4 | Overview |
| 12 | Starter Kits | 4 | Overview |
| 13 | Backend & APIs | 8 | Resource APIs |
| 14 | Vue Components | 8 | Overview |
| 15 | Knowledge Base | 9 | Tips & Tricks |

**130 sidebar links across 15 sections.** Every section heading is a content-free stub carrying
`redirect: {url: '@child', status: 301}`, `curl -I https://statamic.dev/content-modeling` →
`301 → /content-modeling/overview`. A section is a folder, never a page.

### 2. Depth

**The rendered sidebar is exactly two levels, section → page, on every page of the site.** This is
enforced by the template, which iterates `{{ children }}` of top-level nodes and stops. Verified
independently: loading a level-3 URL (`/getting-started/installing/laravel-herd`) still yields the
identical 130-link, 15-section, two-level sidebar. Parsing the Control Panel section, the largest,
at 26 items, shows 26 flat siblings and no nesting.

The *content tree* does reach three levels: `pages.yaml` holds 171 entries at depths 16 / 129 / 26.
All 26 level-3 pages live in `Getting Started`, in three fan-outs: *How to install Statamic* → 8
platform pages, *Upgrade guide* → 11 version-pair pages, *Deploying* → 7 host pages. **What earned
the extra level is permutation, not concept**: same task, different platform or version. None of
them appear in the sidebar; they surface via in-page links and `llms.txt`.

Statamic also adds a *lateral* mode Laravel has no analogue for: on a roster item page the sidebar
is replaced entirely by `← Go back` plus a flat list of that collection. `/tags/collection` shows 98
links; `/modifiers/upper` shows 197. Still two levels, a different tree.

### 3. On-ramp

**A quickstart and inline teaching; no tutorial chapter.** `/getting-started/quick-start-guide` is
one page with 21 `##` sections running start to finish ("Install Statamic" → "Make a home page" →
"Now let's build a blog" → "Customizing your blueprint" → "Going deeper"). Beside it sits a
philosophy page, `/getting-started/core-concepts`, with headings like `## Statamic is flat _first_`
and `## The Control Panel can be optional`.

5.x had a `screencasts` collection with chapters; in 6.x that collection is gone and
`https://statamic.dev/screencasts` 301s to `https://www.youtube.com/statamic`.

Inline teaching at the head of concept pages is the house style and it is *structural*: **137 of 171
page entries carry an `intro:` field**, declared in
<https://github.com/statamic/docs/blob/6.x/resources/fieldsets/page.yaml> and rendered as a lede
under the `<h1>`; 63 of 171 then open with a literal `## Overview`.

### 4. Page template

One universal template,
<https://github.com/statamic/docs/blob/6.x/resources/views/page.antlers.html>, whose order is
hardcoded:

1. optional `<figure>` from `screenshot` / `screenshot_dark` asset fields, caption hardcoded to
   *"The {{ title }} in action!"*
2. `<h1>` + `intro` markdown; optional **"Pro Feature"** badge if `pro: true`
3. `{{ content }}`, the hand-written markdown body
4. auto-generated `## Options` if an `options` array exists in frontmatter
5. auto-generated `## Parameters` if `parameters` exists
6. auto-generated `## Variables` if `variables` exists
7. "Learn More!" cross-links, then "Got feedback?" → GitHub edit URL

**Blueprints** (<https://statamic.dev/content-modeling/blueprints>), `## Overview` →
`## Creating Blueprints` → `## Blueprint Workflow and Keyboard Shortcuts` → `## Directory Structure`
→ `## Conditional Fields` → `## YAML Structure` → `## Reusable Fields` → `## Validation` →
`## Grid fieldtype` → `## Unlisted fields`. Seventeen images. Note the movement: **UI walkthrough
first, YAML structure second, on one page.** That is Laravel's teach-then-enumerate applied across
the admin/config boundary rather than across the narrative/roster boundary.

**Live Preview** (<https://statamic.dev/control-panel/live-preview>), `## Overview` →
`## Device sizes` → `## Customizing the toolbar` → `## Preview targets` →
`## Headless / front-end frameworks` → `## Custom rendering`.

**Collection Tag** (<https://statamic.dev/tags/collection>), `## Overview` → `## Example` →
`## Filtering` → `## Pagination` → `## Aliasing` → `## Scoping` → `## Grouping`, then the
template-generated `## Parameters` (19 `###`, one per parameter) and `## Variables`.

Markdown extensions (custom CommonMark parsers in `app/Markdown/`): `:::tip` ×314, `:::warning` ×56,
`:::best` ×18, `:::watch` ×9 (inline YouTube embed), `:::hint` ×5. Plus `::tabs` / `::tab antlers` /
`::tab blade` used **399 times** to show Antlers and Blade side by side, the two-templating-language
problem solved with one component.

### 5. Rosters: structured data, generated presentation

**Each roster item is its own page, in its own content collection**, with `route: '/{type}/{slug}'`:

| Roster | Item pages | Index page | Index shape |
| --- | --- | --- | --- |
| Tags | 97 | `/tags/all-tags` | 2-column Type / Description table |
| Modifiers | 196 | `/modifiers/all-modifiers` | grouped into 10 taxonomy buckets (Array, Asset, Conditions, Date, Markup, Math, Number, Relationship, String, Utility) |
| Fieldtypes | 47 | `/fieldtypes/all-fieldtypes` | icon grid |
| Variables | 59 | `/variables/all-variables` | flat list |
| Widgets | 3 | `/widgets/all-widgets` | list |

**The split point is unusual and it is the single most transferable finding in this section:
nothing is generated from the Statamic source code, but the roster's *presentation* is generated
from hand-authored structured frontmatter.**
<https://github.com/statamic/docs/blob/6.x/resources/fieldsets/common.yaml> declares `screenshot`,
`screenshot_dark`, `parameters` (a grid of name / type / required / description), and `variables`.
An author writes prose in the markdown body and fills the `parameters:` array in YAML; the template
appends the `## Parameters` table. The index pages have **zero headings in their body**. They are
pure frontmatter plus a `template:`.

That means: hand-written content, machine-enforced shape. A parameter table cannot drift in
*format*, only in *fact*. There are no GitHub Actions in the repo (`.github/` holds only
`FUNDING.yml`), so nothing checks the facts.

CLI commands and config options are *not* rostered this way, they stay hand-written prose inside a
single page (`/advanced-topics/cli`, `/getting-started/configuration`).

### 6. Extension authorship: dissolved on purpose in v6

**5.x had a dedicated top-level surface** at `/extending` with its own sidebar and a 41-entry
`extending-docs` collection, sectioned Front-end / Control Panel / Javascript / Core & Data /
Addons.

**6.x deleted it.** `/extending` now 301s to `/`, and
<https://github.com/statamic/docs/blob/6.x/routes/redirects.php> is the receipt, every old
`extending/*` URL maps to a new home *by subject*:

- `Addons` (4), the only section named for extension authorship
- `Backend & APIs` (8), actions, blink cache, events, hooks, query scopes, repositories, data
- `Vue Components` (8), plus an off-site Storybook at `https://ui.statamic.dev`
- `Control Panel`, 9 authoring pages mixed among its 26 (Extending CP Navigation, Field Actions,
  Publish Forms, Toast Notifications, CSS & JavaScript, Custom Permissions, Utilities, …)
- and singles scattered into `Fieldtypes`, `Tags`, `Modifiers`, `Widgets`, `Frontend`,
  `Advanced Topics`

Roughly 33–34 addon-authoring pages, **homed by subject rather than by audience**. This is the
survey's only worked example of a team that *had* an audience-split section, ran it for a major
version, and then deliberately unwound it. Plumix's map assumes two audiences and one site; Statamic
tried two audiences and two navs, and reverted.

### 7. Versioning

**Per-version subdomains, one git branch each.**
<https://github.com/statamic/docs/blob/6.x/config/docs.php>:

```php
'versions' => [
    ['version' => '6', 'branch' => '6.x', 'url' => 'https://statamic.dev'],
    ['version' => '5', 'branch' => '5.x', 'url' => 'https://v5.statamic.dev'],
],
```

Only two are live; v3/v4 subdomains no longer resolve. The switcher is a `<select>` that navigates
to `${url}/from/{{ page:id }}`, and `routes/web.php` defines `/from/{id?}` to look the entry up **by
UUID** and redirect to that entry's URL on the target version. **Entry UUIDs are stable across
branches, so switching version lands you on the same page even though the slug changed completely
between 5.x and 6.x.** That is the best version-switch mechanism in the survey and it costs one
stable identifier per page.

**Unstable APIs are essentially unmarked.** No `experimental`, `beta`, `unstable`, or `deprecated`
frontmatter field exists anywhere in `content/`. The only structured page badge is `pro: true` (14
pages), which renders a "Pro Feature" badge next to the `<h1>` linking to `/licensing`, and does
*not* appear in the nav. Experimental status appears in prose only, twice.

### 8. Admin-UI documentation

**The Control Panel gets its own 26-page section**, the largest in the docs, opened by
`/control-panel/overview` (`## Dashboard` → `## Content Management` → `## Users & Permissions` →
`## Command Palette` → `## Preferences` → `## Forms & Submissions` → `## Content Tools` →
`## Navigation & Extensibility`).

51 of 171 prose pages carry images; 228 `<img>` tags total; 424 image files in `public/img` on the
6.x branch. The house convention is a raw `<figure>` with a **light/dark pair** and a caption:

```html
<figure>
    <img src="/img/dashboard.webp"      class="u-hide-in-dark-mode">
    <img src="/img/dashboard-dark.webp" class="u-hide-in-light-mode">
    <figcaption>The default dashboard with no widgets</figcaption>
</figure>
```

All WebP, no arrows or numbered annotations. Fieldtype pages get their screenshots *structurally*
rather than in prose, `screenshot` / `screenshot_dark` asset fields on 46 of 47 fieldtype entries,
rendered by the template with the auto caption "The {title} in action!".

**Currency: the screenshot directory is namespaced by CMS major.**
`public/img/fieldtypes/screenshots/v6/` holds **123 files** (61 of them `-dark`) on the 6.x branch,
independently confirmed; that directory does not exist on 5.x, which has 63 files in an unversioned
folder. A major release means a fresh re-shoot into a new `vN/` folder with the entry's
`screenshot:` path repointed. Quick-start images are version-stamped in the filename instead
(`/img/quick-start/installed-6.webp`). No automation checks or regenerates any of it, but the
*convention* makes staleness visible, because a v5 path on a v6 page is a lint you can write.

Video lives off-site in two places (`youtube.com/statamic`, and a Laracasts series behind
`learnstatamic.com`) plus inline via `:::watch <url>`, 9 uses, always after the intro and before
the first `##`.

### 9. Audience split

**One site, one nav, and exactly one page for editors.** There is no separate non-developer docs
surface. The editor-facing content is
<https://statamic.dev/knowledge-base/content-managers-guide>, titled "Content Manager's Guide to
Statamic". A *single page*, filed in the **last** section (Knowledge Base, 15 of 15).

Its headings are addressed straight at non-developers: `## Four things you need to know.` →
`### We can't get into your site.` / `### Every site is unique.` /
`### Statamic sites are _very_ easy to change.` / `### Every Statamic site needs a developer.`, then
`## FAQs` → *Where do I login to my Statamic site's Control Panel?* / *How do I reset my password?* /
*What do I do if my site is broken?* / *How do I find a new Statamic developer?*

The page's own thesis is that the reader should go find a developer. That is a deliberate scoping
move, not an omission: **Statamic answers the editor-audience question with one page that redirects
the audience**, rather than with a section it would have to maintain. For a Plumix map that declares
content-editor documentation out of scope, this is the cheapest known way to honour that decision
without leaving the reader stranded.

The seam, then, is a *page boundary*, not a nav boundary. A content manager lands in the same
15-section developer sidebar as everyone else.

### 10. Content modelling

**Section 2 of 15, immediately after Getting Started, and the largest concentration of modelling
material in the survey after Payload.** Fifteen pages: Overview, Collections, Structures, Navigation,
Taxonomies, Globals, Blueprints, Computed Values, Data Inheritance, Fieldsets, Fields,
Relationships, Routing, Revisions, Validation.

`/content-modeling/overview` is a conceptual essay, not a how-to:
`## The Separation of Content and Presentation` → `## Start with Collections` →
`## Then Define Your Fields` → `## Global Variables for everything else` → `## What to Avoid`
(`### Modeling Pages Instead of Content`, `### Over-Modeling Everything`,
`### Ignoring Future Change`). A modelling section that opens by telling you what *not* to model is
a shape no other product in the survey attempts, and it maps almost exactly onto Plumix's entry
type / taxonomy / meta-box decisions.

**Fieldtypes are split out** into their own top-level section (6 of 15) because the 47-item roster
outgrew a page, a textbook instance of Laravel's promotion rule.

This too is a 6.x invention. In 5.x, Collections / Taxonomies / Globals / Structures / Fields sat
under `Core Concepts` while Blueprints, Fieldsets, Conditional Fields and Fieldtypes Overview sat
under **`Control Panel`**. **v6 pulled the modelling story out of the Control Panel section and
promoted it to slot 2.** That is the single most directly applicable precedent in this document:
a Laravel-lineage CMS discovered that filing content modelling under the admin UI was wrong, and
moved it to the front.

### Verdict on Laravel's three properties

**(a) Two levels everywhere, inherited, intact.** The rendered sidebar is strictly section → page
across the whole site, template-enforced. The content tree's third level exists only for
install/upgrade/deploy permutations in `Getting Started` and never renders in the nav. The Control
Panel did not break it, even at 26 pages.

**(b) Teach-then-enumerate within a page, inherited, and mechanised further than Laravel.**
`page.antlers.html` appends `## Options` / `## Parameters` / `## Variables` after the body, so the
roster *physically cannot* precede the narrative. Statamic then adds a move Laravel does not need:
teach-then-enumerate *across* pages, because 196 modifiers and 97 tags will not fit at the bottom of
a teaching page, a hand-written `Overview` leads, and the exhaustive list lives on a generated
`All X` page. **This is the answer to the question Plumix's map leaves open about roster scale.**

**(c) Promotion to a top-level section, mechanism inherited, first page renamed.** Nine sections are
promoted subsystems (Fieldtypes, Tags, Variables, Modifiers, Widgets, Addons, Starter Kits, Vue
Components, Backend & APIs). Each opens with a landing page titled **`Overview`**, not "Getting
Started", 11 of 15 sections lead with `Overview`. `Getting Started` survives as a section name
exactly once, at the top of the spine.

**What the Control Panel actually broke: subject/audience coherence, inside the section named after
it.** `Control Panel` interleaves end-user surface docs (Dashboard, Live Preview, Users, Roles,
Permissions, Multi-User Collaboration) with pure extension APIs (Extending CP Navigation, Field
Actions, Publish Forms, Toast Notifications, CSS & JavaScript, Custom Permissions). It also forced
two structures Laravel has no analogue for, a `Vue Components` top-level section plus a separate
Storybook site, and a versioned screenshot corpus. **Laravel's docs shape survives contact with an
admin UI; Laravel's docs *audience model* does not.**

---

## EmDash

**Identification first, because the ticket's pointer is wrong.** There is no `cloudflare/emdash`
repo (`gh api repos/cloudflare/emdash` → 404). The project lives at
**<https://github.com/emdash-cms/emdash>**, MIT, and was announced on Cloudflare's own blog
(<https://blog.cloudflare.com/emdash-wordpress/>). Marketing site
<https://emdashcms.com>; docs at **<https://docs.emdashcms.com>**, an **Astro Starlight** site whose
source is `docs/` in the same monorepo. Beware `generalaction/emdash`, an unrelated project.

Maturity: created 2026-04-01, actively pushed, **pre-1.0** (latest tagged release `emdash@0.34.0`,
2026-08-18), 249 open issues. Runtime: Astro integration on Cloudflare Workers, D1 for data, R2 for
media, plugins executed in isolates via Dynamic Worker Loaders; content stored as Portable Text
rather than serialized HTML (<https://github.com/emdash-cms/emdash/blob/main/README.md>).

**The docs are not thin.** 78 pages with a committed sidebar config is a real docs site, larger
than Plumix's current `apps/docs`, comparable in page count to a mid-size framework. What *is* thin
is the editor-facing surface (see point 9) and the reference tier (7 pages).

Source of truth for the spine:
<https://github.com/emdash-cms/emdash/blob/main/docs/astro.config.mjs>, the Starlight `sidebar`
array, read directly. UNVERIFIED: whether the deployed sidebar at docs.emdashcms.com matches `main`.

### 1. Spine, verbatim and in order

| # | Section (verbatim) | Pages |
| --- | --- | --- |
| 1 | Start Here | 5 |
| 2 | Coming From... | 3 |
| 3 | Guides | 17 |
| 4 | Plugins | 4 |
| 5 | Migration | 3 |
| 6 | Plugin Development | 19 |
| 7 | Contributing | 4 |
| 8 | Themes | 4 |
| 9 | Deployment | 8 |
| 10 | Concepts | 4 |
| 11 | Reference *(collapsed)* | 7 |

**78 pages.** The order is visibly accreted rather than designed: `Contributing` is wedged at 7
between `Plugin Development` and `Themes`, and `Concepts`, the section that explains what the
product *is*, sits at 10, below `Deployment`. A reader following the sidebar top to bottom learns
to deploy before learning the content model.

`Coming From...` is the most distinctive section name in the whole survey: three pages,
*EmDash for WordPress Developers*, *Astro for WordPress Developers*, *EmDash for Astro Developers*,
a section whose organising principle is the reader's prior platform, placed second, before any
concept material.

### 2. Depth

**Three levels, in exactly one place.** Everything is section → page except `Plugin Development`,
which nests two `collapsed: true` groups: **Sandboxed Plugins** (11 pages) and **Native Plugins**
(5 pages), with a routing page, `Choosing a Plugin Format`, sitting *outside* both groups and
above them.

What earned the extra level is a genuine product fork: two mutually exclusive plugin formats with
different capabilities and different security properties. This is the cleanest justification for
depth-3 in the survey, and the pattern is worth naming: **a fork in the road gets a chooser page at
depth 2 and one collapsed group per branch at depth 3.**

### 3. On-ramp

**Both, and they are separate pages.** Quickstart is `Start Here → Getting Started`
(<https://docs.emdashcms.com/getting-started/>, "Create your first EmDash site in under 5 minutes"),
using Starlight `<Tabs>` for package managers and `<Steps>` for the ordered sequence. The tutorial
is `Guides → Create a Blog` (<https://docs.emdashcms.com/guides/create-a-blog/>), one long page,
not a chaptered tutorial: `Prerequisites` → `Define the Posts Collection` → `Create Your First Post`
→ `Display Posts on Your Site` → `Add Categories and Tags` → `Add Pagination` → `Add an RSS Feed` →
`Next Steps`.

Teaching does **not** appear inline at the head of concept pages. Concept pages open with a single
orienting sentence and go straight to `##` headings. The wayfinding is at the *tail* instead: every
concept page ends with `## Next steps` and a link block. That is the opposite of Laravel's
teach-then-enumerate, and closer to a linear book.

### 4. Page template

Frontmatter is minimal and uniform: `title` + `description` only. Then MDX imports, one orienting
sentence, `##` sections, and a closing `## Next steps`.

**Architecture** (<https://docs.emdashcms.com/concepts/architecture/>). `What EmDash adds to your
site` → `Your content model` → `Content is live` → `What you configure` → `Extending with plugins`
→ `Next steps`.

**Collections** (<https://docs.emdashcms.com/concepts/collections/>). `Creating collections` →
`Collection features` → `Field types` (with `Text fields`, `Rich content`, `Numbers`, `Booleans and
dates`, `Selection`, `Media and references` beneath) → `Field properties` → `Validation rules` →
`Widget options` → `Querying collections` → `Type generation` → `Database mapping` → `Next steps`.

**Content Model** (<https://docs.emdashcms.com/concepts/content-model/>). `Collections and fields`
→ `System fields` → `Changing the model anytime` → `TypeScript types` → `Workflows` → `Seed files`
→ `Next steps`.

Heading case is inconsistent: sentence-case in `Concepts`, Title Case in `Guides` and `Start Here`,
despite a `contributing/docs-style-guide` page existing.

### 5. Rosters

**Entirely hand-written MDX; nothing generated.** `docs/package.json` has only
`dev`/`build`/`preview`/`astro`/`generate-types`, and the last is `wrangler types` for Worker
bindings, not docs.

The recurring roster shape is **summary table first, then per-item detail on the same page**:

- `reference/field-types` opens "EmDash supports 16 field types", prints a
  `Type | SQLite Column | Description` table covering all 16, then a `### \`string\`` block per type
  with a TypeScript snippet, a **Validation options** list, and a **Widget options** list. The
  template is applied strictly enough that a type with nothing to say still emits `- None specific`.
- `reference/hooks` uses the same shape: a `Hook | Trigger | Can Modify | Exclusive` table over all
  26 hooks, then `### \`content:beforeSave\`` per hook. The `Exclusive` column carries real
  semantics in the table itself, only `email:deliver` and `comment:moderate` are exclusive.

Drift risk is unmanaged: the count "16 field types" is asserted in prose with nothing binding it to
the implementation. (Plumix already has the counter-pattern, the field-type roster guard test that
binds roster to union.)

### 6. Extension authorship

**The largest area of the docs: 23 of 78 pages, ~30%,** split across two sections by side of the
contract. `Plugins` (4) is the consumer side, overview, installing, registry, upgrading. `Plugin
Development` (19) is the author side, forked into Sandboxed (manifest, CLI, hooks, API routes,
storage, settings, Block Kit, capabilities & security, publishing, migrating to the CLI) and Native
(React admin pages & widgets, Portable Text components, page fragments, distributing), plus
`Querying the Registry` and `Field Kit`.

`Themes` is a separate 4-page section including `Porting WordPress Themes`, and `Migration` carries
`Porting WordPress Plugins`. WordPress porting is treated as a first-class authorship path, not a
footnote.

### 7. Versioning

**The site does not version.** No versioning plugin in the Starlight config; deps are
`@astrojs/starlight`, `@astrojs/starlight-tailwind`, `starlight-utils`, with no version switcher.
One live version, tracking `main`. For a pre-1.0 project that is the right call.

Instability is marked **in the config surface rather than in doc-site chrome**:
`reference/configuration` has a top-level `experimental` key and all unstable options nest under
`experimental.*`, fronted by a Starlight `<Aside>` telling the reader to pin an exact version. No
per-page badges, no "since vX" annotations. The API namespace *is* the stability marker. The docs
merely describe it. This is a cheaper mechanism than Strapi's `<FeatureFlagBadge>` and worth
weighing against it.

### 8. Admin-UI documentation

**Five screenshots. In the whole site.** `docs/src/assets/screenshots/` holds
`admin-dashboard.png`, `admin-post-editor.png`, `admin-posts-list.png`, `admin-content-types.png`,
`admin-media-library.png`, imported as Astro image assets so they are optimised at build. Two of
them are used on `getting-started.mdx`. No video, no annotated figures, no interactive walkthrough.

Everything else about the admin is prose plus `<Card>`/`<CardGrid>`,
<https://docs.emdashcms.com/concepts/admin-panel/> runs `Screens` → `Roles` → `Content editor` →
`Media library` → `Plugin pages and widgets` → `Next steps` with no imagery at all.

Currency is achieved by having almost nothing to keep current. That is a real strategy and it has a
real cost: the admin panel is described but not shown.

### 9. Audience split

**There is no split and no editor track.** One site, one nav, developer-only. No editor handbook on
docs.emdashcms.com and none on emdashcms.com, whose entire top nav is Docs / Blog / Discord.

The nearest thing to a seam is one page, `concepts/admin-panel`, whose own description hedges across
all three audiences: "What the EmDash admin panel offers editors, administrators, and developers."

For a project explicitly positioned as a WordPress successor, a CMS whose defining property is that
non-developers operate it every day, this is the largest gap in its IA. **The audience split does not
resolve itself by being ignored.** EmDash has instead invested in a
*third* audience: `Start Here → Docs MCP for AI Tools` plus a shipped `/llms.txt` and a
`reference/mcp-server` page. The docs are currently better equipped for agents than for editors.

### 10. Content modelling

**Filed late, taught early, and the gap between those two is the finding.** The doctrinal home is
`Concepts → Collections` and `Concepts → Content Model`, in **section 10 of 11**, below Deployment.
As a spine position that is close to the worst case.

In practice the reader meets it much sooner: `Guides → Create a Blog` reaches "Define the Posts
Collection" as its second heading, and `Guides → Working with Content` is the third entry in
`Guides`. So the material is encountered on roughly page 7, and the `Concepts` section functions as
a place to go *back* to, not a place to start.

The load is split three ways with meaningful overlap: `concepts/collections` (how to define),
`concepts/content-model` (how it evolves, system fields, seed files, workflows), and
`reference/field-types` (the exhaustive 16-type roster). `concepts/collections` also contains a
`Field types` subsection, so the field roster is documented in two places at two depths.

---

## Cross-cutting comparison

### Spine at a glance

| | Top-level sections | Total pages | Nav tiers | Sidebar depth | Versioned |
| --- | --- | --- | --- | --- | --- |
| **Payload** | 5 groups / 26 topics | 148 | group → topic → page | 3 rendered, 2 navigable | v2 archived at path prefix |
| **Strapi** | 10 (CMS) + 6 (Cloud) | 147 + 22 | 2 sidebars behind 2 tabs | **4** | per-major subdomain |
| **Sanity** | 6 masthead groups / 31 sections | 677 | masthead → section → sidebar group → page | **2** (per section) | no, API versions by date |
| **Directus** | 4 groups / 7 sections | 390 | group tab → section → group → page | **4** | no |
| **Statamic** | 15 | 130 | section → page | **2** | per-major subdomain + branch |
| **EmDash** | 11 | 78 | section → page | 2, except one fork | no |

### Where the six actually agree

Four convergences held across products that never coordinated, and each is a decision Plumix can
stop re-litigating:

1. **Nobody generates the product's own reference material.** Field types, config options, hooks
   and CLI flags are hand-written everywhere. Generation, where it exists, is confined to the HTTP API (Directus,
   Sanity) or to a separate reference site (Sanity's `reference.sanity.io`). Directus states the
   boundary outright: *the HTTP API is generated; types, interfaces, env vars, SDK and CLI are
   prose.* Plumix's map already assumes hand-written exhaustive rosters. This survey is four
   independent confirmations that the assumption is normal rather than brave.
2. **Screenshots come in light/dark pairs.** Payload (`<LightDarkImage>`, both `src` fields
   `required: true`), Strapi (`<ThemedImage>`, 150 uses), Statamic (`u-hide-in-dark-mode` /
   `u-hide-in-light-mode` figure pairs) each arrived at the same convention independently. Any Plumix
   screenshot policy that does not budget for two captures per shot is already wrong.
3. **The image budget goes to the admin UI and nowhere else.** Directus: 1.9 images/page in guides,
   **0.0** in community, self-hosting and licensing. Sanity: 8.4 per article in `User guides`,
   **0** across HTTP API, CLI, Specifications and Libraries. Two teams, same allocation.
4. **Stability markers live in the title string, not in nav chrome.** Payload
   (`TypeScript Plugin (Experimental)`), Sanity (`Scheduled publishing (deprecated)`,
   `Embeddings index (deprecated)`), EmDash (an `experimental.*` config namespace). Only Strapi built
   a badge component, and it earns it by keying the badge to the feature-flag name. Sanity built the
   *field* (`experimental: true` on 16 articles) and never rendered it: the cautionary case.

### Where they diverge, and which fork matters

**Roster shape splits the field cleanly.** Payload gives each of ~22 field types its own page;
Sanity gives each of 19 schema types its own page; Statamic gives each of 47 fieldtypes, 97 tags and
196 modifiers its own page in its own content collection. Strapi puts all 23 field types as `####`
headings inside one Content-type Builder page; Directus puts all 40 interfaces in one 665-line page
with 42 screenshots; EmDash puts all 16 field types on one reference page behind a summary table.

The dividing line is **roster size and per-item payload**, not taste. A per-item page wins when an
item needs a screenshot plus an options table plus an example, which is exactly Plumix's field-type
situation. A single indexed page wins when an item is one sentence and one snippet, which is
Plumix's *modifier*-shaped material (shortcodes, hydration strategies, capabilities).

Statamic shows the hybrid, and it is the answer to the question Plumix's map leaves open about
roster scale: **a hand-written `Overview` teaching page leads the section, and the exhaustive list
lives on a generated-from-frontmatter `All X` index page**, so teach-then-enumerate survives across
pages when it can no longer fit within one.

**Sidebar depth splits on whether the nav is one tree or two.** Directus kept one tree and went four
deep across 390 pages. Sanity split the nav into a global product switcher plus a section-scoped
sidebar and held **two levels across 677 pages**. Statamic held two levels across 130 pages with a
26-page section, template-enforced. Flatness at scale is achievable, but only by paying for it with
a second nav widget or by capping section size.

### Point 8: how the admin UI is taught

Five distinct strategies, in ascending cost:

| Product | Mechanism | Volume | Currency mechanism |
| --- | --- | --- | --- |
| **EmDash** | prose + `<Card>` grids | **5 screenshots total** | nothing to keep current |
| **Sanity** | tightly cropped screenshots, descriptive alt, italic caption | 638 image blocks / 183 articles | `lastReview` field (248/657), `v3State` re-review enum, reader-visible `Last updated` |
| **Payload** | `<LightDarkImage>` as the visual index of the field roster | 78 images / 154 pages | none; both `src` fields `required: true` in the docs schema |
| **Statamic** | `<figure>` light/dark pairs + `screenshot` frontmatter field | 228 `<img>`, 424 files | **screenshot directory namespaced by CMS major** (`screenshots/v6/`, 123 files) |
| **Directus** | full-window 2× captures, pointing done in alt text | 747 references / 375 pages | none; no capture script, no CI check |
| **Strapi** | `<ThemedImage>` ×150, `<Guideflow>` ×13 (embedded interactive walkthrough), `<Icon>` inline | 803 assets / 262 pages | none automated |

Two techniques stand out as durability engineering rather than volume:

- **Sanity crops tight.** A `774x758` shot of one dropdown survives a redesign of everything around
  it; Directus's `3840x2160` full-window captures are invalidated by any chrome change. This is the
  cheapest currency mechanism in the survey because it costs nothing at capture time.
- **Statamic versions the folder.** `public/img/fieldtypes/screenshots/v6/` does not exist on the
  5.x branch. A major release means a re-shoot into a new `vN/` directory. No automation enforces it,
  but the *convention makes staleness lintable*: a `v5` path on a v6 page is a check anyone can
  write.

And one enforcement idea worth copying outright: Payload's docs schema declares `srcLight` and
`srcDark` as **`required: true`**, so a single-theme screenshot is unpublishable. The convention is a
validation rule, not a style guide entry.

### Point 9: the developer/editor audience split

This is where the six differ most, and the spread is instructive because it includes one team that
tried a split and reverted, and one that built the split and never wired it up.

| Product | Arrangement | Where the seam sits |
| --- | --- | --- |
| **Payload** | **No editor docs at all.** `/docs/user-guide` 404s | no seam; one audience |
| **EmDash** | **No editor docs at all.** One hedging page, `concepts/admin-panel` | no seam; invested in an *agent* audience instead (`docs-mcp`, `/llms.txt`) |
| **Statamic** | **One page**, `Content Manager's Guide`, filed last (15 of 15) | page boundary, not nav boundary; the page tells the reader to go find a developer |
| **Strapi** | **Formerly two sites, merged.** `/user-docs/*` **308s to `/cms/intro`** | *inside the page*: `## Configuration` (dev) → `## Usage` (editor) → `## Usage with APIs` (dev) |
| **Directus** | **Interleaved in one nav.** Role model exists (`Developer` / `Non-Developer`) but drives homepage order, search bias and code-sample default. **The sidebar is byte-identical for both** | group tab bar only |
| **Sanity** | **Two named sibling sections** under `Resources`, sized honestly (`User guides` 18, `Developer guides` 60), then deliberately re-mixed by **cross-listing with provenance tags** | one nav heading, plus per-feature borrowing |

Three findings a Plumix spec should absorb:

1. **Nobody who split by audience kept the split.** Strapi merged two sites into one. Statamic
   dissolved `/extending` in v6 and re-homed 41 pages *by subject*. Sanity separates the two tracks
   by section and then borrows pages across the boundary in both directions. The audience-split
   section is a shape teams try and then unwind.
2. **The two products with no editor documentation are the two closest to Plumix technically.**
   Payload and EmDash both serve exactly one audience. Plumix's map declares content-editor docs out
   of scope, which puts it in this camp, and the EmDash case shows the cost: a CMS pitched as a
   WordPress successor whose docs never address the people who use it daily.
3. **Statamic's single page is the cheapest honest answer.** One page, in the last section, that
   scopes the editor question and hands the reader off, rather than a section nobody maintains or a
   pretence that editors do not exist. For a spec that has ruled editor docs out of scope, this is
   the pattern that honours the decision without stranding the reader.

A fourth, quieter finding: **the audience split is now three-way.** Sanity ships a `Copy article`
cluster (Open in ChatGPT / Claude / Cursor / VS Code, MCP install command) and serves every page as
`.md`. EmDash ships `Start Here → Docs MCP for AI Tools` plus `/llms.txt`. Strapi ships an `AI`
section whose two pages are literally split by audience: `Strapi AI for content managers` and
`AI for developers and docs`. Directus and Sanity both publish `llms.txt`. Every product in this
survey except Payload has an explicit agent-facing surface.

### Point 10: where content modelling sits

| Product | Position | How early a reader meets it |
| --- | --- | --- |
| **Payload** | `Basics → Configuration`, second topic of the first group; `Fields` two topics later | page 5 of the docs; field roster by page 12 |
| **Directus** | `Guides → Data Model`, first group, and **the section's own landing target**, so clicking `Guides` lands on Collections | page 3 of the tutorial |
| **Statamic** | `Content Modeling`, **section 2 of 15**, 15 pages; `Fieldtypes` promoted to its own section (6 of 15) | second section |
| **Strapi** | `Content Type Builder`, **promoted out of `Features` into `Getting Started`** (6th entry), taught as an admin-UI walkthrough with the 23-type roster inside | quickstart Part B |
| **Sanity** | `Platform → APIs and SDKs → Schemas`, first group of the second masthead group; field roster split off to `Studio → Studio schema reference` | quickstart step 2 of 4 |
| **EmDash** | `Concepts → Collections` / `Content Model`, **section 10 of 11, below Deployment** | ~page 7, via `Guides → Create a Blog` |

**Every product except EmDash puts content modelling in the first or second position of its spine.**
That is as close to unanimous as this survey gets, and it settles a question Plumix's map leaves
implicit.

Two second-order decisions matter as much as the position:

- **Doctrine and roster can separate.** Sanity keeps *how to model content* with the platform APIs
  (framework-agnostic) and the *exhaustive field-type roster* with the Studio (tool-level), one click
  apart. Statamic does the same with `Content Modeling` (15 pages) and a promoted `Fieldtypes`
  section. Payload keeps both in `Basics` as adjacent topics. All three work; what does not work is
  EmDash's arrangement, where `concepts/collections` has a `Field types` subsection *and*
  `reference/field-types` exists, so the roster is documented twice at two depths.
- **Filing modelling under the admin UI is a mistake products correct.** Statamic v5 had Blueprints,
  Fieldsets and Fieldtypes Overview under **`Control Panel`**; **v6 pulled them out and promoted
  `Content Modeling` to slot 2.** Sanity still has the field roster under `Studio` and pays for it
  with a depth-3 position behind a portfolio nav. Plumix, whose meta boxes are simultaneously a
  storage contract and an admin-UI card, is exposed to exactly this error.

## Recommendation

### The closest structural model for Plumix is Statamic

Not Payload, despite Payload being the closest technical analogue. The reasoning:

**Statamic is the only product in the survey that holds Laravel's three properties intact while
shipping a control panel.** Its rendered sidebar is exactly two levels on every page of the site,
template-enforced, across 130 pages including a 26-page Control Panel section. Its page template
mechanises teach-then-enumerate so the roster *physically cannot* precede the narrative. Nine of its
fifteen sections are promoted subsystems. Plumix's map names those three properties as load-bearing
and asks whether they survive contact with an admin UI; Statamic is the proof that they do.

It is also the only product that has already made the two decisions Plumix is about to make, and
made them in public with a git history:

- **v6 pulled content modelling out of the `Control Panel` section and promoted it to slot 2.**
  Plumix's meta box is both a storage contract and an admin-UI card, which is precisely the ambiguity
  that put Blueprints under `Control Panel` in Statamic 5. The correction has already been run.
- **v6 dissolved the `/extending` section and re-homed 41 extension-authoring pages by subject.**
  Plumix's map assumes two audiences (site builder, extension author) on one site. Statamic ran the
  audience-split nav for a major version and reverted to subject grouping. Sanity's cross-listing
  reaches the same conclusion from the other direction.

Where Statamic is *not* the model: its spine is fifteen sections deep in the list sense, several of
which (Variables at 2 pages, Widgets at 3, Modifiers at 3) are thin promotions that exist only to
host a roster index. Plumix should promote on the same rule but hold a shorter list.

**Second choice, and worth reading alongside: Payload.** Its `Basics → Configuration → Fields`
opening is the most content-model-forward spine of the six, its field-type roster is the closest
match to Plumix's, and its group → topic → page arrangement is what Plumix will need if the tree
outgrows a flat fifteen. Take Payload's *content order* and Statamic's *structural discipline*.

### One pattern worth stealing from each

**Payload.** Make the screenshot convention a validation rule.
`src/collections/Docs/blocks/lightDarkImage/index.ts` declares both `srcLight` and `srcDark` as
`required: true`. A single-theme screenshot cannot be published. Plumix should express its screenshot
policy as something a build can fail on, a remark/rehype check that every image reference in
`apps/docs` has a dark counterpart, rather than as a line in a style guide. This is the same instinct
as the existing field-type roster guard test: bind the convention to a check, not to discipline.

**Strapi.** Put a four-slot fact box at the head of every feature page.
`<IdentityCard>` answers, before any prose: *what plan is this in, what role do I need, is it on by
default, does it work in production.* Nineteen uses, one per Features page. Plumix's equivalent
questions are sharper and currently unanswered anywhere: *which package ships this, which capability
gates it, is it on by default, does it work at the edge or only in Node.* A committed component with
fixed slots forces the answer onto every page and makes its absence a visible hole. Pair it with
Strapi's `<Tldr>`, 285 uses against 284 files, i.e. mandatory, not decorative.

**Sanity.** Cross-list pages into other sections with a provenance tag.
A page is authored once and *borrowed* into whichever other sections need it, rendering with a small
grey label naming its home section. `User guides` shows 18 entries of which only 9 live there; the
Studio sidebar borrows back the other way. This is how Sanity holds a two-level sidebar across 677
pages and two audiences with no duplication and no filter toggle. For Plumix it solves a concrete
problem the map has not yet faced: a hooks page belongs in both the plugin-author track and the
site-builder track, and duplicating it guarantees drift.

**Directus.** Declare the generate-vs-write boundary explicitly, and state it in the repo.
Directus's build runs `generate-api-reference.ts` before `nuxt build` for the HTTP API and
nothing else, with `nuxt.config.ts` stating outright that the SDK reference lives in the source
repository. The boundary is a build step and a sentence, not a tacit habit. Plumix's map already
declares no TypeDoc and no generated appendix; write that down where the build can see it, and name
the one exception if the REST API ever earns one.

**Statamic.** Hand-write the content, template-generate the roster's shape.
`resources/fieldsets/common.yaml` declares `parameters` and `variables` as structured grids in
frontmatter; `page.antlers.html` appends `## Options` / `## Parameters` / `## Variables` after the
body. Authors write prose and fill a YAML array; the table format cannot drift, only the facts can.
Combined with the version-namespaced screenshot directory (`screenshots/v6/`), this gives Plumix a
concrete answer to the roster-drift fog: **machine-enforced shape, hand-written fact, lintable
staleness.**

**EmDash.** Add a `Coming From...` section, and place it second.
Three pages organised by the reader's prior platform: *EmDash for WordPress Developers*, *Astro for
WordPress Developers*, *EmDash for Astro Developers*. Plumix is explicitly WordPress- and
Astro-lineage and its map lists "Coming from WordPress" as an unresolved question. EmDash has already
answered it with a small section keyed to *where the reader came from*, sitting second in the spine
before any concept material, rather than with one comparison page buried somewhere. Steal both the
shape and the position.

### Two things not to copy

**Sanity's product-shaped spine.** Six masthead groups named after shipped applications works because
Sanity ships six applications. Plumix ships one admin. A portfolio spine without a portfolio is an
org chart.

**Sanity's unrendered `experimental` flag.** A first-class `experimental: true` boolean exists on 16
articles and no template renders it. The string never reaches the reader. A stability marker that
nothing displays is worse than none, because the team believes the problem is solved. If Plumix adds
a stability field, the page template that renders it ships in the same change.

### Open question this survey does not settle

Every one of the six hand-writes its product rosters and **none of them has automation that
checks the facts.** Statamic has no CI at all in its docs repo; Directus gates only typecheck,
stable-ids and redirects; EmDash asserts "16 field types" in prose with nothing binding it to the
implementation. Plumix already has the counter-example in-repo: the field-type roster guard that binds
the roster to its union. So the drift-control question in the map is not answered by prior art. It
has to be decided on Plumix's own terms.
